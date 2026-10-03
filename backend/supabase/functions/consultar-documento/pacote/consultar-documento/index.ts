/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * Edge `consultar-documento` — núcleo do app Consulta.
 *
 * Recebe `{ consulta_id }`, debita a carteira do tenant, chama o provedor
 * (Motor de Crédito) e grava o resultado. Se a API falhar, estorna o débito.
 *
 * Disparada por:
 *  - app tenant (consulta manual direta)
 *  - trigger pós-aprovação de comprovante (venda automática — F6/F7)
 *
 * verify_jwt = false (disparada server-side por trigger via pg_net). A edge
 * opera com service_role e processa por `consulta_id`. Autorização fina do
 * fluxo manual entra no F4. Débito/estorno são idempotentes (RPCs).
 */

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { criarProvider, type TipoDoc } from "../_shared/consulta-provider.ts";

type ConsultaRow = {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  tipo_doc: TipoDoc | null;
  documento: string | null;
  status: string;
  params_api: Record<string, unknown> | null;
  codigo_api: string | null;
};

/** Humaniza uma chave técnica do resultado (snake_case → Título). */
function humanizarSecao(chave: string): string {
  return chave.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()).trim();
}

/**
 * Decisão #3: fraciona o resultado da consulta em memórias do lead (uma por
 * seção relevante), pra o agente puxar por similaridade só o pedaço de dívida
 * que importa. Heurística genérica sobre o jsonb (formato varia por serviço).
 * Não falha a consulta se der erro (best-effort).
 */
async function fracionarEmMemorias(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  consulta: ConsultaRow,
  resultado: unknown,
): Promise<void> {
  try {
    if (!resultado || typeof resultado !== "object" || !consulta.lead_id) return;
    const base = {
      lead_id: consulta.lead_id,
      tenant_id: consulta.tenant_id,
      categoria: "fato_financeiro",
      fonte: "auto",
      escopo: "longo",
      embedding_status: "pendente",
      modulo: "consulta",
    };
    const fatos: Array<{ fato: string; relevancia: string }> = [];

    for (const [secao, valor] of Object.entries(resultado as Record<string, unknown>)) {
      if (!valor || typeof valor !== "object") continue;
      const obj = valor as Record<string, unknown>;
      const nome = humanizarSecao(secao);

      // Seção com contagem de registros (pendências, protestos, etc.)
      if ("num_registros" in obj || "quantidade" in obj) {
        const n = Number(obj.num_registros ?? obj.quantidade ?? 0);
        if (n > 0) {
          fatos.push({ fato: `Consulta: ${n} registro(s) em "${nome}" no documento do contato.`, relevancia: "alta" });
        } else {
          fatos.push({ fato: `Consulta: nenhum registro em "${nome}".`, relevancia: "baixa" });
        }
        continue;
      }

      // Seção cadastral (campos escalares legíveis)
      const pares = Object.entries(obj)
        .filter(([, v]) => v != null && (typeof v === "string" || typeof v === "number"))
        .map(([k, v]) => `${humanizarSecao(k)}: ${v}`);
      if (pares.length) {
        fatos.push({ fato: `Consulta (${nome}) — ${pares.slice(0, 8).join("; ")}.`, relevancia: "media" });
      }
    }

    if (!fatos.length) return;
    await supabase.from("memoria_lead").insert(fatos.map((f) => ({ ...base, fato: f.fato, relevancia: f.relevancia })));
  } catch (e) {
    console.warn("[fracionar memória consulta]", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const { consulta_id } = await req.json().catch(() => ({}));
    if (!consulta_id) return jsonRes({ ok: false, erro: "consulta_id ausente" }, 400);

    const supabase = criarClienteAdmin();

    // Autorização (auditoria 2026-08-31): a edge move dinheiro (débito + consulta
    // paga). Só pode disparar quem é o motor/servidor (service_role — usado pela
    // validar-comprovante pós-aprovação) OU o próprio tenant dono da consulta
    // (app autenticado). Anônimo enumerando consulta_id é barrado.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const isService = bearer.length > 0 && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let callerId: string | null = null;
    if (!isService) {
      if (!bearer) return jsonRes({ ok: false, erro: "nao_autorizado" }, 401);
      const { data: authu } = await supabase.auth.getUser(bearer);
      callerId = authu?.user?.id ?? null;
      if (!callerId) return jsonRes({ ok: false, erro: "nao_autorizado" }, 401);
    }

    // 1. Carrega a consulta + codigo_api do tipo
    const { data, error } = await supabase
      .from("consultas")
      .select("id, tenant_id, lead_id, tipo_doc, documento, status, params_api, consultas_tipos(codigo_api)")
      .eq("id", consulta_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) return jsonRes({ ok: false, erro: "consulta_nao_encontrada" }, 404);

    // Tenant só age sobre a própria consulta (ou de conta cuja equipe pertence).
    if (!isService) {
      let ehDono = data.tenant_id === callerId;
      if (!ehDono && callerId) {
        const { data: prof } = await supabase
          .from("profiles").select("parent_user_id").eq("id", callerId).maybeSingle();
        ehDono = prof?.parent_user_id != null && prof.parent_user_id === data.tenant_id;
      }
      if (!ehDono) return jsonRes({ ok: false, erro: "nao_autorizado" }, 403);
    }

    const tipoRel = data.consultas_tipos as { codigo_api: string } | { codigo_api: string }[] | null;
    const codigo_api = Array.isArray(tipoRel) ? tipoRel[0]?.codigo_api : tipoRel?.codigo_api;
    const consulta: ConsultaRow = { ...data, codigo_api: codigo_api ?? null } as ConsultaRow;

    if (!consulta.documento || !consulta.tipo_doc || !consulta.codigo_api) {
      return jsonRes({ ok: false, erro: "consulta_incompleta" }, 400);
    }
    if (consulta.status === "concluida") {
      return jsonRes({ ok: true, erro: "ja_concluida" });
    }

    // 2. Débito atômico (idempotente). Falha de saldo = não chama a API.
    const { data: deb, error: errDeb } = await supabase.rpc("debitar_carteira_consulta", {
      p_consulta_id: consulta_id,
    });
    if (errDeb) throw new Error(`debitar falhou: ${errDeb.message}`);
    if (!deb?.ok) {
      await supabase
        .from("consultas")
        .update({ status: "erro", erro_motivo: deb?.erro ?? "debito_falhou" })
        .eq("id", consulta_id);
      // 200 (não 402): erro de negócio. supabase-js só entrega o body em 2xx — o front lê `ok:false`.
      return jsonRes({ ok: false, erro: deb?.erro ?? "debito_falhou", detalhe: deb }, 200);
    }

    // 3. Marca consultando e chama o provedor
    await supabase.from("consultas").update({ status: "consultando" }).eq("id", consulta_id);

    const provider = await criarProvider(supabase);
    const res = await provider.consultar(
      consulta.codigo_api,
      consulta.tipo_doc,
      consulta.documento,
      consulta.params_api ?? {},
    );

    // 4a. Falhou → estorna + status erro
    if (!res.ok) {
      await supabase.rpc("estornar_carteira_consulta", { p_consulta_id: consulta_id });
      await supabase
        .from("consultas")
        .update({ status: "erro", erro_motivo: res.erro ?? "api_falhou" })
        .eq("id", consulta_id);
      // 200 (não 502): a API externa falhou e já estornamos. O front lê `ok:false` + o motivo.
      // NÃO ecoamos `res.bruto` (resposta crua do provedor) — edge é verify_jwt=false; o motivo
      // fica em `consultas.erro_motivo` (lido por canal autenticado, protegido por RLS do tenant).
      return jsonRes({ ok: false, erro: res.erro ?? "api_falhou" }, 200);
    }

    // 4b. Sucesso → grava resultado
    await supabase
      .from("consultas")
      .update({
        status: "concluida",
        resultado: res.bruto,
        consultada_em: new Date().toISOString(),
        erro_motivo: null,
      })
      .eq("id", consulta_id);

    // Decisão #3: fraciona o resultado em memórias do lead (quando vinculado)
    if (consulta.lead_id) await fracionarEmMemorias(supabase, consulta, res.bruto);

    return jsonRes({ ok: true, consulta_id, status: "concluida" });
  } catch (err) {
    return jsonRes({ ok: false, erro: String(err) }, 500);
  }
});

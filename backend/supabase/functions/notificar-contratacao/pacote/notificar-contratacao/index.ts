/**
 * notificar-contratacao — avisa o responsável do tenant que um lead fechou plano.
 *
 * Chamada como ferramenta dinâmica HTTPS pelo motor (`ferramentas_dinamicas`
 * com `endpoint_url` apontando pra cá). O despachante em
 * `_shared/tools-internas.ts:1900` manda `{ args, contexto }` SEM header de
 * autenticação — por isso esta edge roda com `verify_jwt = false` e a trava é
 * feita aqui dentro:
 *
 *  1. `contexto.conversa_id` tem que existir E pertencer a `contexto.tenant_id`.
 *  2. Número de destino e conteúdo saem SEMPRE do banco, nunca dos `args` —
 *     ninguém redireciona a mensagem passando outro telefone.
 *  3. Dedup de 10 min por conversa — chamada repetida não vira spam.
 *
 * Pior caso de abuso: quem adivinhar dois UUIDs válidos dispara UMA mensagem
 * pro próprio número do tenant. Sem vazamento e sem custo relevante.
 *
 * Destino: `agentes.configuracao -> notificacao_contratacao -> numero`.
 * Dados coletados: `prancheta.belief` (a ficha viva que `atualizar_prancheta` alimenta).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ragentic-tenant, x-ragentic-conversa",
};

function resp(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Ordem de exibição no aviso — espelha `cargos.campos_rastreio` do Vendedor. */
const CAMPOS: Array<{ chave: string; rotulo: string }> = [
  { chave: "nome_fantasia", rotulo: "Nome fantasia" },
  { chave: "razao_social", rotulo: "Razão social" },
  { chave: "cnpj", rotulo: "CNPJ" },
  { chave: "responsavel", rotulo: "Responsável" },
  { chave: "cpf_responsavel", rotulo: "CPF" },
  { chave: "whatsapp", rotulo: "WhatsApp" },
  { chave: "tipo_cliente", rotulo: "Tipo" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "endereco", rotulo: "Endereço" },
  { chave: "numero", rotulo: "Número" },
  { chave: "complemento", rotulo: "Complemento" },
  { chave: "bairro", rotulo: "Bairro" },
  { chave: "cidade", rotulo: "Cidade" },
  { chave: "estado", rotulo: "Estado" },
  { chave: "cep", rotulo: "CEP" },
];

const PLANOS: Record<string, string> = {
  "1": "FATIMIN 1 · R$ 49,90/mês",
  "2": "FATIMIN 2 · R$ 99,90/mês",
  "3": "FATIMIN 3 · R$ 149,90/mês",
};

/** "fatimin 2", "2", "plano 99,90" → rótulo cheio. Sem match, devolve o que veio. */
function rotularPlano(bruto: unknown): string {
  const txt = String(bruto ?? "").trim();
  if (!txt) return "não informado";
  const m = txt.match(/([123])/);
  if (m && PLANOS[m[1]]) return PLANOS[m[1]];
  if (/149|150/.test(txt)) return PLANOS["3"];
  if (/99/.test(txt)) return PLANOS["2"];
  if (/49|50/.test(txt)) return PLANOS["1"];
  return txt;
}

function formatarTelefone(bruto: unknown): string {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length < 10) return String(bruto ?? "—");
  const sem55 = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  const ddd = sem55.slice(0, 2);
  const resto = sem55.slice(2);
  return `${ddd} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const contexto = (body?.contexto ?? {}) as Record<string, string | null>;
    const tenantId = contexto.tenant_id ?? req.headers.get("x-ragentic-tenant");
    const conversaId = contexto.conversa_id ?? req.headers.get("x-ragentic-conversa");

    if (!tenantId || !conversaId) {
      return resp({ ok: false, mensagem: "tenant_id e conversa_id são obrigatórios" }, 400);
    }

    const sb = criarClienteAdmin();

    // Trava 1 — a conversa tem que ser mesmo desse tenant.
    const { data: conversa } = await sb
      .from("conversas")
      .select("id, tenant_id, phone, lead_id, agente_id")
      .eq("id", conversaId)
      .maybeSingle();
    if (!conversa || conversa.tenant_id !== tenantId) {
      return resp({ ok: false, mensagem: "conversa não pertence a este tenant" }, 403);
    }

    // Trava 3 — dedup: já avisamos essa conversa nos últimos 10 minutos?
    const desde = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count: jaAvisou } = await sb
      .from("traces")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", conversaId)
      .eq("tipo", "ferramenta")
      .contains("decisao", { ferramenta: "notificar_contratacao", enviado: true })
      .gte("criado_em", desde);
    if (jaAvisou && jaAvisou > 0) {
      return resp({ ok: true, mensagem: "Responsável já foi avisado desta contratação há pouco — não reenviei." });
    }

    // Destino configurado no agente do tenant.
    const { data: agente } = await sb
      .from("agentes")
      .select("id, configuracao")
      .eq("user_id", tenantId)
      .limit(1)
      .maybeSingle();
    const cfg = (agente?.configuracao ?? {}) as Record<string, unknown>;
    const cfgNotif = (cfg.notificacao_contratacao ?? {}) as Record<string, unknown>;
    const destino = String(cfgNotif.numero ?? "").replace(/\D/g, "");
    if (destino.length < 10) {
      return resp({
        ok: false,
        mensagem: "número de destino não configurado em agentes.configuracao.notificacao_contratacao.numero",
      }, 400);
    }

    // Ficha viva da conversa — é onde `atualizar_prancheta` grava campo a campo.
    const { data: prancheta } = await sb
      .from("prancheta")
      .select("belief")
      .eq("conversation_id", conversaId)
      .maybeSingle();
    const belief = (prancheta?.belief ?? {}) as Record<string, unknown>;

    // Nome do lead: prancheta primeiro (foi ele que a agente capturou), depois o CRM.
    let nomeLead = String(belief.nome_lead ?? "").trim();
    if (!nomeLead && conversa.lead_id) {
      const { data: lead } = await sb
        .from("leads")
        .select("name, nome_exibicao")
        .eq("id", conversa.lead_id)
        .maybeSingle();
      nomeLead = String(lead?.nome_exibicao ?? lead?.name ?? "").trim();
    }
    if (!nomeLead) nomeLead = "Contato sem nome";

    const linhas: string[] = [];
    const faltando: string[] = [];
    for (const campo of CAMPOS) {
      const valor = String(belief[campo.chave] ?? "").trim();
      if (valor) linhas.push(`${campo.rotulo}: ${valor}`);
      else faltando.push(campo.rotulo.toLowerCase());
    }

    const mensagem = [
      "🔔 Nova contratação",
      "",
      `Plano: ${rotularPlano(belief.plano_escolhido)}`,
      `Contato: ${nomeLead} · ${formatarTelefone(conversa.phone)}`,
      "",
      // Δ 2026-09-12 (Otmar): a agente não coleta mais cadastro — o OK do lead já
      // dispara o aviso e o cadastro é feito pela Suelen. Sem dado coletado, a lista
      // de "não informado" só poluía a mensagem.
      ...(linhas.length ? linhas : ["Cadastro: a fazer com o cliente (a agente não coleta dados)."]),
      ...(linhas.length && faltando.length ? ["", `Não informado: ${faltando.join(", ")}`] : []),
      "",
      "Próximo passo: assumir a conversa, fazer o cadastro, emitir a cobrança e liberar o acesso.",
    ].join("\n");

    // Canal do próprio tenant — a mensagem sai do número dele.
    const { data: canal } = await sb
      .from("canais")
      .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
      .eq("user_id", tenantId)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .not("zapi_instance_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!canal?.zapi_instance_id || !canal?.zapi_token) {
      return resp({ ok: false, mensagem: "tenant sem canal WhatsApp ativo configurado" }, 400);
    }

    const base = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
    // 2026-09-17: sem timeout, um Z-API lento fazia o despachante abortar em 10s e
    // TENTAR DE NOVO — o dono recebia o mesmo aviso duas vezes. Agora corta antes.
    const envio = await fetch(`${base}/send-text`, {
      signal: AbortSignal.timeout(8000),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": canal.zapi_security_token || "",
      },
      body: JSON.stringify({ phone: destino, message: mensagem }),
    });
    const corpoEnvio = await envio.text();
    const enviado = envio.ok;

    // Trilha — alimenta o dedup acima e deixa rastro pro dono auditar.
    await sb.from("traces").insert({
      tenant_id: tenantId,
      conversa_id: conversaId,
      agente_id: conversa.agente_id,
      tipo: "ferramenta",
      decisao: {
        ferramenta: "notificar_contratacao",
        enviado,
        destino,
        status_zapi: envio.status,
        campos_preenchidos: linhas.length,
        campos_faltando: faltando.length,
        resposta: corpoEnvio.slice(0, 300),
      },
    });

    if (!enviado) {
      return resp({
        ok: false,
        mensagem: `falha ao enviar pro responsável (Z-API ${envio.status}). Avise o dono por outro caminho.`,
      }, 502);
    }

    return resp({
      ok: true,
      dados: { campos_preenchidos: linhas.length, campos_faltando: faltando.length },
      mensagem: "Responsável avisado da contratação.",
    });
  } catch (e) {
    return resp({ ok: false, mensagem: `erro interno: ${(e as Error).message}` }, 500);
  }
});

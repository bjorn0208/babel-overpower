/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * Edge `validar-comprovante-consulta` — F6.
 *
 * Lê o comprovante de pagamento por LLM de visão, extrai dados + confiança,
 * compara com as regras do tenant e decide (decisão #1):
 *   - modo "manual"  → sempre fila_revisao (não gasta visão)
 *   - modo "auto"    → aprovado dispara consulta; reprovado = recusada
 *   - modo "fila"    → aprovado dispara consulta; reprovado/baixa confiança = fila_revisao
 *
 * Aprovado → status consultando + invoke consultar-documento (debita + consulta).
 * verify_jwt = false (chamada pelo link público anon após enviar comprovante).
 */

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

const MODELO_VISAO_FALLBACK = "google/gemini-2.0-flash-001";

type Analise = {
  nome?: string | null;
  data_pagamento?: string | null;
  valor?: number | null;
  cnpj?: string | null;
  legivel?: boolean;
  confianca?: number;
};

function normalizar(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function digitos(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

function nomeBate(extraido: unknown, esperado: unknown): boolean {
  const e = normalizar(esperado);
  if (!e) return true;
  const x = normalizar(extraido);
  if (!x) return false;
  // bate se o esperado está contido OU compartilham os 2 primeiros nomes
  if (x.includes(e) || e.includes(x)) return true;
  const partesE = e.split(/\s+/).filter((p) => p.length > 2);
  const partesX = x.split(/\s+/);
  const comuns = partesE.filter((p) => partesX.includes(p));
  return comuns.length >= Math.min(2, partesE.length);
}

function dataOk(dataExtraida: unknown, modo: string | undefined): boolean {
  if (!dataExtraida) return false;
  const d = new Date(String(dataExtraida));
  if (isNaN(d.getTime())) return false;
  const hoje = new Date();
  const dDia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (modo === "anterior_ok") return dDia.getTime() <= hDia.getTime();
  // default "dia": precisa ser hoje
  return dDia.getTime() === hDia.getTime();
}

async function lerComprovante(
  baseUrl: string,
  apiKey: string,
  modelo: string,
  urlComprovante: string,
): Promise<Analise> {
  const instrucao =
    "Você analisa um comprovante de pagamento (PIX/transferência). " +
    "Extraia os campos e devolva SOMENTE um JSON válido, sem texto fora dele, no formato: " +
    '{"nome": "nome do pagador ou null", "data_pagamento": "AAAA-MM-DD ou null", ' +
    '"valor": número ou null, "cnpj": "apenas dígitos do CNPJ/CPF recebedor ou null", ' +
    '"legivel": true/false (se o comprovante está legível e parece autêntico), ' +
    '"confianca": número de 0 a 100 (quão confiante você está na leitura)}.';

  const body = {
    model: modelo,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instrucao },
          { type: "image_url", image_url: { url: urlComprovante } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: "json_object" },
  };

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://plataformalimpa.com.br",
      "X-Title": "Plataforma Limpa · validação comprovante",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`visão ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const txt = (j.choices?.[0]?.message?.content as string) ?? "{}";
  const limpo = txt.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(limpo) as Analise;
  } catch {
    return { legivel: false, confianca: 0 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const { token, consulta_id } = await req.json().catch(() => ({}));
    if (!token && !consulta_id) return jsonRes({ ok: false, erro: "token ou consulta_id ausente" }, 400);

    const supabase = criarClienteAdmin();

    const sel = supabase
      .from("consultas")
      .select("id, tenant_id, preco, url_comprovante_pagamento, validacao_comprovante, status, dados_cliente, consultas_tipos(custo)")
      .is("deleted_at", null);
    const { data: c } = await (token
      ? sel.eq("chave_publica", token)
      : sel.eq("id", consulta_id)
    ).maybeSingle();

    if (!c) return jsonRes({ ok: false, erro: "consulta_nao_encontrada" }, 404);
    if (c.status !== "comprovante_enviado") {
      return jsonRes({ ok: true, decisao: "ignorado", status: c.status });
    }

    // Regras: snapshot da consulta ou config do tenant
    let regras: Record<string, unknown> =
      c.validacao_comprovante && Object.keys(c.validacao_comprovante).length
        ? c.validacao_comprovante
        : {};
    if (!Object.keys(regras).length) {
      const { data: cfg } = await supabase
        .from("consultas_config_tenant")
        .select("validacao_comprovante")
        .eq("tenant_id", c.tenant_id)
        .maybeSingle();
      regras = (cfg?.validacao_comprovante as Record<string, unknown>) ?? {};
    }

    const modo = (regras.modo as string) ?? "manual";
    const criterios = (regras.criterios as Record<string, boolean>) ?? {};
    const limite = Number(regras.limite_confianca ?? 70);

    // Modo manual ou sem comprovante → fila de revisão (não gasta visão)
    if (modo === "manual" || !c.url_comprovante_pagamento) {
      await supabase.from("consultas").update({ status: "fila_revisao" }).eq("id", c.id);
      return jsonRes({ ok: true, decisao: "fila_revisao", motivo: modo === "manual" ? "modo_manual" : "sem_comprovante" });
    }

    // Auditoria 2026-08-31: auto-aprovar sem NENHUM critério de verificação
    // (nome/valor/cnpj/data) significa que qualquer imagem legível passa e
    // dispara consulta paga. Sem critério configurado → revisão humana
    // obrigatória (também poupa a chamada de visão).
    const algumCriterio = ["nome", "valor", "cnpj", "data"].some(
      (k) => (criterios as Record<string, boolean>)[k],
    );
    if (!algumCriterio) {
      await supabase
        .from("consultas")
        .update({ status: "fila_revisao", erro_motivo: "sem critérios de validação configurados" })
        .eq("id", c.id);
      return jsonRes({ ok: true, decisao: "fila_revisao", motivo: "sem_criterios" });
    }

    // Visão — qualquer falha (provedor ausente, API fora, leitura ilegível) NÃO trava
    // a consulta: cai pra fila de revisão humana em vez de retornar 500.
    let analise: Analise;
    try {
      const { data: prov } = await supabase
        .from("provedores_llm")
        .select("base_url, api_key")
        .eq("slug", "openrouter")
        .eq("is_active", true)
        .single();
      if (!prov?.api_key) throw new Error("provedor openrouter ausente");

      // Modelo de visão via cascata tenant→nicho→global (mesma chave do B3 multimodal)
      let modelo = MODELO_VISAO_FALLBACK;
      try {
        const { data: cfgLLM } = await supabase.rpc("obter_config_chamada_llm", {
          p_chave: "sintese",
          p_tenant_id: c.tenant_id,
          p_nicho_id: null,
        });
        if (cfgLLM?.modelo) modelo = cfgLLM.modelo;
      } catch { /* usa fallback */ }

      analise = await lerComprovante(prov.base_url, prov.api_key, modelo, c.url_comprovante_pagamento);
    } catch (errVisao) {
      await supabase
        .from("consultas")
        .update({
          status: "fila_revisao",
          erro_motivo: `leitura automática indisponível: ${String(errVisao).slice(0, 200)}`,
        })
        .eq("id", c.id);
      return jsonRes({ ok: true, decisao: "fila_revisao", motivo: "falha_visao" });
    }

    // Compara com os critérios marcados.
    // Regra de ouro: critério sem valor de referência PULA (nunca barra o cliente por config incompleta).
    const dadosCliente = (c.dados_cliente ?? {}) as Record<string, unknown>;
    // Nome esperado: prioriza o que o tenant fixou; senão usa o nome que o cliente preencheu no formulário.
    const nomeAlvo =
      (regras.nome_esperado as string) ||
      (dadosCliente.nome_completo as string) ||
      (dadosCliente.nome as string) ||
      "";
    const cnpjAlvo = digitos(regras.cnpj_esperado);

    const falhas: string[] = [];
    if (criterios.nome && nomeAlvo && !nomeBate(analise.nome, nomeAlvo)) falhas.push("nome");
    if (criterios.valor && c.preco != null && Math.abs(Number(analise.valor ?? -1) - Number(c.preco)) > 0.01) falhas.push("valor");
    if (criterios.cnpj && cnpjAlvo && digitos(analise.cnpj) !== cnpjAlvo) falhas.push("cnpj");
    if (criterios.data && !dataOk(analise.data_pagamento, regras.data_modo as string)) falhas.push("data");

    const confOk = Number(analise.confianca ?? 0) >= limite;
    const aprovado = falhas.length === 0 && confOk && analise.legivel !== false;

    await supabase
      .from("consultas")
      .update({ comprovante_analise: { analise, falhas, aprovado, limite } })
      .eq("id", c.id);

    if (aprovado) {
      // Defesa de saldo (camada 4 da catraca): se o tenant ficou sem saldo entre gerar o link
      // e o pagamento, não dispara a consulta (consultar-documento marcaria "erro" e queimaria
      // a tentativa). Segura em fila de revisão pro tenant repor saldo e reprocessar.
      const tipoRel = c.consultas_tipos as { custo: number } | { custo: number }[] | null;
      const custoConsulta = Array.isArray(tipoRel) ? tipoRel[0]?.custo : tipoRel?.custo;
      if (custoConsulta != null) {
        const { data: cart } = await supabase
          .from("consultas_saldo")
          .select("saldo")
          .eq("tenant_id", c.tenant_id)
          .maybeSingle();
        if (Number(cart?.saldo ?? 0) < Number(custoConsulta)) {
          await supabase
            .from("consultas")
            .update({ status: "fila_revisao", erro_motivo: "tenant sem saldo para processar a consulta" })
            .eq("id", c.id);
          return jsonRes({ ok: true, decisao: "fila_revisao", motivo: "tenant_sem_saldo" });
        }
      }
      await supabase.from("consultas").update({ status: "consultando" }).eq("id", c.id);
      await supabase.functions.invoke("consultar-documento", { body: { consulta_id: c.id } });
      return jsonRes({ ok: true, decisao: "aprovado", analise });
    }

    const destino = modo === "fila" ? "fila_revisao" : "recusada";
    await supabase
      .from("consultas")
      .update({
        status: destino,
        erro_motivo: falhas.length ? `comprovante reprovado: ${falhas.join(", ")}` : "baixa confiança na leitura",
      })
      .eq("id", c.id);
    return jsonRes({ ok: true, decisao: destino, falhas, analise });
  } catch (err) {
    return jsonRes({ ok: false, erro: String(err) }, 500);
  }
});

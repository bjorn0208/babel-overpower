/**
 * notificar-boleto — avisa o financeiro do tenant que um lead fechou numa forma de
 * pagamento que DEPENDE DO FINANCEIRO: boleto (emitir) ou cartão (mandar o link).
 *
 * Primeiro uso: SmartCred Caicó (Max, 2026-09-15). A Mika pergunta a forma de
 * pagamento; no Pix ela mesma manda a chave, no boleto tenta uma vez o Pix e no
 * cartão avisa que o financeiro manda o link — nos dois últimos ela chama esta
 * ferramenta com `forma` pra mandar ao financeiro tudo o que ele precisa.
 * `forma` ausente = boleto (compatível com quem já chamava sem o campo).
 *
 * Mesmo desenho de segurança do `notificar-contratacao` (despachante manda
 * `{ args, contexto }` sem auth, então verify_jwt = false e a trava é aqui):
 *  1. `contexto.conversa_id` tem que existir E pertencer a `contexto.tenant_id`.
 *  2. Destino SEMPRE do banco (`agentes.configuracao.notificacao_boleto.numero`),
 *     nunca dos args. Telefone do lead sai da conversa, não dos args.
 *  3. Dedup de 10 min por conversa.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ragentic-tenant, x-ragentic-conversa",
};

// Sempre 200: o despachante do motor descarta o corpo de resposta não-2xx
// ("chamada externa falhou (400)") e o modelo ficaria sem saber o que faltou.
// O ok:false vai dentro de `dados` e o modelo lê a mensagem.
function resp(body: Record<string, unknown>, _status = 200): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function texto(v: unknown): string {
  return String(v ?? "").trim().slice(0, 600);
}

function formatarTelefone(bruto: unknown): string {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length < 10) return String(bruto ?? "—");
  const sem55 = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  const ddd = sem55.slice(0, 2);
  const resto = sem55.slice(2);
  return `${ddd} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

/** O que o aviso pede ao lead. `obrigatorio` só vale pro boleto: pra emitir, o
 * financeiro precisa de nome + CPF/CNPJ. O link de cartão ele gera sem isso. */
const DADOS_LEAD: Array<{ chave: string; rotulo: string; obrigatorio?: boolean }> = [
  { chave: "nome_completo", rotulo: "Nome completo", obrigatorio: true },
  { chave: "cpf_cnpj", rotulo: "CPF/CNPJ", obrigatorio: true },
  { chave: "email", rotulo: "E-mail" },
  { chave: "endereco", rotulo: "Endereço" },
  { chave: "cep", rotulo: "CEP" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const args = (body?.args ?? {}) as Record<string, unknown>;
    const contexto = (body?.contexto ?? {}) as Record<string, string | null>;
    const tenantId = contexto.tenant_id ?? req.headers.get("x-ragentic-tenant");
    const conversaId = contexto.conversa_id ?? req.headers.get("x-ragentic-conversa");

    if (!tenantId || !conversaId) {
      return resp({ ok: false, mensagem: "tenant_id e conversa_id são obrigatórios" }, 400);
    }

    const produto = texto(args.produto);
    const valor = texto(args.valor);
    if (!produto || !valor) {
      return resp({ ok: false, mensagem: "informe produto e valor (com a condição: à vista ou entrada + parcelas)" }, 400);
    }
    // `forma` aceita o que o modelo costuma escrever (cartão, crédito, cartao_credito).
    const ehCartao = /cart|cr[eé]dit/i.test(texto(args.forma));
    const forma: "boleto" | "cartao" = ehCartao ? "cartao" : "boleto";
    if (forma === "boleto") {
      const faltando = DADOS_LEAD.filter((c) => c.obrigatorio && !texto(args[c.chave])).map((c) => c.rotulo);
      if (faltando.length) {
        return resp({
          ok: false,
          mensagem: `faltam dados pra emitir o boleto: ${faltando.join(", ")}. Peça ao lead e chame de novo.`,
        }, 400);
      }
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
      .contains("decisao", { ferramenta: "notificar_boleto", enviado: true, forma })
      .gte("criado_em", desde);
    if (jaAvisou && jaAvisou > 0) {
      return resp({
        ok: true,
        mensagem: forma === "cartao"
          ? "O financeiro já foi avisado deste pagamento no cartão há pouco — não reenviei."
          : "O financeiro já foi avisado deste boleto há pouco — não reenviei.",
      });
    }

    // Destino configurado no agente do tenant.
    const { data: agente } = await sb
      .from("agentes")
      .select("id, configuracao")
      .eq("user_id", tenantId)
      .limit(1)
      .maybeSingle();
    const cfg = (agente?.configuracao ?? {}) as Record<string, unknown>;
    const cfgNotif = (cfg.notificacao_boleto ?? {}) as Record<string, unknown>;
    const destino = String(cfgNotif.numero ?? "").replace(/\D/g, "");
    if (destino.length < 10) {
      return resp({
        ok: false,
        mensagem: "número do financeiro não configurado em agentes.configuracao.notificacao_boleto.numero",
      }, 400);
    }

    let nomeCrm = "";
    if (conversa.lead_id) {
      const { data: lead } = await sb
        .from("leads")
        .select("name, nome_exibicao")
        .eq("id", conversa.lead_id)
        .maybeSingle();
      nomeCrm = String(lead?.nome_exibicao ?? lead?.name ?? "").trim();
    }

    const linhasLead = DADOS_LEAD
      .map((c) => ({ ...c, valor: texto(args[c.chave]) }))
      .filter((c) => c.valor)
      .map((c) => `${c.rotulo}: ${c.valor}`);

    const vencimento = texto(args.vencimento);
    const resumo = texto(args.resumo_conversa);
    const observacao = texto(args.observacao);

    const mensagem = [
      forma === "cartao" ? "💳 Enviar link de pagamento no cartão" : "🧾 Gerar boleto",
      "",
      `Produto: ${produto}`,
      `Valor: ${valor}`,
      ...(vencimento ? [`Vencimento pedido: ${vencimento}`] : []),
      "",
      "Dados do lead",
      ...linhasLead,
      `WhatsApp: ${formatarTelefone(conversa.phone)}${nomeCrm ? ` (${nomeCrm})` : ""}`,
      ...(resumo ? ["", `Conversa: ${resumo}`] : []),
      ...(observacao ? ["", `Obs.: ${observacao}`] : []),
      "",
      forma === "cartao"
        ? "Próximo passo: gerar o link de pagamento no cartão e enviar pro lead nesse WhatsApp. A agente já avisou que o financeiro vai mandar."
        : "Próximo passo: gerar o boleto e enviar pro lead nesse WhatsApp. A agente já avisou que o financeiro vai mandar.",
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
        ferramenta: "notificar_boleto",
        forma,
        enviado,
        destino,
        status_zapi: envio.status,
        produto,
        valor,
        resposta: corpoEnvio.slice(0, 300),
      },
    });

    if (!enviado) {
      return resp({
        ok: false,
        mensagem: `falha ao avisar o financeiro (Z-API ${envio.status}). Chame transferir_humano pra equipe ${forma === "cartao" ? "mandar o link do cartão" : "gerar o boleto"}.`,
      }, 502);
    }

    return resp({
      ok: true,
      mensagem: forma === "cartao"
        ? "Financeiro avisado. Diga ao lead que o link de pagamento no cartão será enviado pelo time do financeiro aqui no WhatsApp."
        : "Financeiro avisado. Diga ao lead que o boleto será gerado pelo time do financeiro e enviado aqui no WhatsApp.",
    });
  } catch (e) {
    return resp({ ok: false, mensagem: `erro interno: ${(e as Error).message}` }, 500);
  }
});

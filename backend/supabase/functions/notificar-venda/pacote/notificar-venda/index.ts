/**
 * notificar-venda — avisa o time do tenant que um lead FECHOU, com os dados que a
 * equipe precisa pra entregar o serviço.
 *
 * Primeiro uso: Easy (Tiago, 2026-09-16). Fechada a venda do Diagnóstico ou da
 * Auditoria, a Naty pede os dados do cliente, diz que o setor responsável entra em
 * contato pra entregar entre 12 e 24h úteis, e chama esta ferramenta pra mandar a
 * venda e os dados pro WhatsApp do Tiago.
 *
 * Diferente de `notificar-boleto` (que pede ao financeiro GERAR um meio de pagamento),
 * aqui o pagamento já aconteceu: o aviso é de ENTREGA.
 *
 * Mesmo desenho de segurança das outras duas (o despachante manda `{ args, contexto }`
 * sem auth, então verify_jwt = false e a trava mora aqui):
 *  1. `contexto.conversa_id` tem que existir E pertencer a `contexto.tenant_id`.
 *  2. Destino SEMPRE do banco (`agentes.configuracao.notificacao_venda.numero`),
 *     nunca dos args. Telefone do lead sai da conversa, não dos args.
 *  3. Dedup de 10 min por conversa.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ragentic-tenant, x-ragentic-conversa",
};

// Sempre 200: o despachante do motor descarta o corpo de resposta não-2xx e o modelo
// ficaria sem saber o que faltou. O ok:false vai dentro e o modelo lê a mensagem.
function resp(body: Record<string, unknown>): Response {
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

/** Dados do cliente no aviso, na ordem. `obrigatorio` = sem isso o time não entrega. */
const DADOS_CLIENTE: Array<{ chave: string; rotulo: string; obrigatorio?: boolean }> = [
  { chave: "nome_completo", rotulo: "Nome completo", obrigatorio: true },
  { chave: "cpf_cnpj", rotulo: "CPF/CNPJ", obrigatorio: true },
  { chave: "email", rotulo: "E-mail" },
  { chave: "data_nascimento", rotulo: "Data de nascimento" },
  { chave: "telefone_contato", rotulo: "Telefone de contato" },
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
      return resp({ ok: false, mensagem: "tenant_id e conversa_id são obrigatórios" });
    }

    const produto = texto(args.produto);
    const valor = texto(args.valor);
    if (!produto || !valor) {
      return resp({ ok: false, mensagem: "informe produto (o que foi vendido) e valor pago" });
    }
    const faltando = DADOS_CLIENTE.filter((c) => c.obrigatorio && !texto(args[c.chave])).map((c) => c.rotulo);
    if (faltando.length) {
      return resp({
        ok: false,
        mensagem: `faltam dados do cliente pra equipe entregar: ${faltando.join(", ")}. Peça ao cliente e chame de novo.`,
      });
    }

    const sb = criarClienteAdmin();

    // Trava 1 — a conversa tem que ser mesmo desse tenant.
    const { data: conversa } = await sb
      .from("conversas")
      .select("id, tenant_id, phone, lead_id, agente_id")
      .eq("id", conversaId)
      .maybeSingle();
    if (!conversa || conversa.tenant_id !== tenantId) {
      return resp({ ok: false, mensagem: "conversa não pertence a este tenant" });
    }

    // Trava 2 — dedup: já avisamos essa conversa nos últimos 10 minutos?
    const desde = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count: jaAvisou } = await sb
      .from("traces")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", conversaId)
      .eq("tipo", "ferramenta")
      .contains("decisao", { ferramenta: "notificar_venda", enviado: true })
      .gte("criado_em", desde);
    if (jaAvisou && jaAvisou > 0) {
      return resp({ ok: true, mensagem: "A equipe já foi avisada desta venda há pouco — não reenviei." });
    }

    // Destino configurado no agente do tenant.
    const { data: agente } = await sb
      .from("agentes")
      .select("id, configuracao")
      .eq("user_id", tenantId)
      .limit(1)
      .maybeSingle();
    const cfg = (agente?.configuracao ?? {}) as Record<string, unknown>;
    const cfgNotif = (cfg.notificacao_venda ?? {}) as Record<string, unknown>;
    const destino = String(cfgNotif.numero ?? "").replace(/\D/g, "");
    if (destino.length < 10) {
      return resp({
        ok: false,
        mensagem: "número da equipe não configurado em agentes.configuracao.notificacao_venda.numero",
      });
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

    const linhasCliente = DADOS_CLIENTE
      .map((c) => ({ ...c, valor: texto(args[c.chave]) }))
      .filter((c) => c.valor)
      .map((c) => `${c.rotulo}: ${c.valor}`);

    const forma = texto(args.forma_pagamento);
    const prazo = texto(args.prazo_combinado);
    const resumo = texto(args.resumo_conversa);
    const observacao = texto(args.observacao);

    const mensagem = [
      "✅ Venda fechada — entregar",
      "",
      `Serviço: ${produto}`,
      `Valor: ${valor}`,
      ...(forma ? [`Pagamento: ${forma}`] : []),
      "",
      "Dados do cliente",
      ...linhasCliente,
      `WhatsApp: ${formatarTelefone(conversa.phone)}${nomeCrm ? ` (${nomeCrm})` : ""}`,
      ...(resumo ? ["", `Conversa: ${resumo}`] : []),
      ...(observacao ? ["", `Obs.: ${observacao}`] : []),
      "",
      prazo
        ? `Próximo passo: entrar em contato com o cliente e entregar. A agente prometeu ${prazo}.`
        : "Próximo passo: entrar em contato com o cliente e entregar. A agente já avisou que o setor responsável vai chamar.",
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
      return resp({ ok: false, mensagem: "tenant sem canal WhatsApp ativo configurado" });
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

    await sb.from("traces").insert({
      tenant_id: tenantId,
      conversa_id: conversaId,
      agente_id: conversa.agente_id,
      tipo: "ferramenta",
      decisao: {
        ferramenta: "notificar_venda",
        enviado,
        destino,
        status_zapi: envio.status,
        produto,
        valor,
        forma_pagamento: forma || null,
        resposta: corpoEnvio.slice(0, 300),
      },
    });

    if (!enviado) {
      return resp({
        ok: false,
        mensagem: `falha ao avisar a equipe (Z-API ${envio.status}). Chame transferir_humano com o motivo "entregar serviço vendido".`,
      });
    }

    return resp({
      ok: true,
      mensagem: "Equipe avisada com os dados do cliente. Confirme ao cliente que o setor responsável vai entrar em contato pra entregar.",
    });
  } catch (e) {
    return resp({ ok: false, mensagem: `erro interno: ${(e as Error).message}` });
  }
});

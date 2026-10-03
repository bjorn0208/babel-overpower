/**
 * notificar-analise — repassa um lead JÁ QUALIFICADO para a pessoa que vai fazer a
 * análise/cotação, com tudo que ela precisa pra seguir sozinha.
 *
 * Primeiro uso: Fina Consórcio (Dayane, 2026-09-16). Depois de explicar o consórcio e
 * coletar os dados do lead, a Fina chama esta ferramenta e a atendente humana recebe no
 * WhatsApp o perfil do lead e o que ele busca, pra rodar as melhores opções.
 *
 * Diferente de `notificar-venda`: ali a venda JÁ fechou e o aviso é de ENTREGA, com
 * produto e valor pago obrigatórios. Aqui NÃO houve venda — o aviso é de ANÁLISE, e o
 * que importa é o objetivo do lead e a capacidade de pagamento.
 *
 * Mesmo desenho de segurança da notificar-venda/boleto (o despachante manda
 * `{ args, contexto }` sem auth, então verify_jwt = false e a trava mora aqui):
 *  1. `contexto.conversa_id` tem que existir E pertencer a `contexto.tenant_id`.
 *  2. Destino SEMPRE do banco (`agentes.configuracao.notificacao_analise.numero`),
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

/** Campos do aviso, na ordem. `obrigatorio` = sem isso a pessoa não consegue analisar. */
const CAMPOS: Array<{ chave: string; rotulo: string; obrigatorio?: boolean }> = [
  { chave: "nome_completo", rotulo: "Nome completo", obrigatorio: true },
  { chave: "cpf", rotulo: "CPF" },
  { chave: "cnpj", rotulo: "CNPJ" },
  { chave: "data_nascimento", rotulo: "Data de nascimento" },
  { chave: "email", rotulo: "E-mail" },
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

    const servico = texto(args.servico);
    const objetivo = texto(args.objetivo);
    if (!servico || !objetivo) {
      return resp({
        ok: false,
        mensagem: "informe servico (ex.: Consórcio de imóvel) e objetivo (o que o lead quer alcançar)",
      });
    }
    const faltando = CAMPOS.filter((c) => c.obrigatorio && !texto(args[c.chave])).map((c) => c.rotulo);
    if (faltando.length) {
      return resp({
        ok: false,
        mensagem: `faltam dados pra análise: ${faltando.join(", ")}. Peça ao lead e chame de novo.`,
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

    // Trava 2 — dedup: já pedimos análise pra essa conversa nos últimos 10 minutos?
    const desde = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count: jaAvisou } = await sb
      .from("traces")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", conversaId)
      .eq("tipo", "ferramenta")
      .contains("decisao", { ferramenta: "notificar_analise", enviado: true })
      .gte("criado_em", desde);
    if (jaAvisou && jaAvisou > 0) {
      return resp({ ok: true, mensagem: "A equipe já recebeu este pedido de análise há pouco — não reenviei." });
    }

    // Destino configurado no agente do tenant.
    const { data: agente } = await sb
      .from("agentes")
      .select("id, configuracao")
      .eq("user_id", tenantId)
      .limit(1)
      .maybeSingle();
    const cfg = (agente?.configuracao ?? {}) as Record<string, unknown>;
    const cfgNotif = (cfg.notificacao_analise ?? {}) as Record<string, unknown>;
    const destino = String(cfgNotif.numero ?? "").replace(/\D/g, "");
    if (destino.length < 10) {
      return resp({
        ok: false,
        mensagem: "número da equipe não configurado em agentes.configuracao.notificacao_analise.numero",
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

    const linhasLead = CAMPOS
      .map((c) => ({ ...c, valor: texto(args[c.chave]) }))
      .filter((c) => c.valor)
      .map((c) => `${c.rotulo}: ${c.valor}`);

    const valorPretendido = texto(args.valor_pretendido);
    const capacidade = texto(args.capacidade_mensal);
    const prazo = texto(args.prazo_desejado);
    const urgencia = texto(args.urgencia);
    const resumo = texto(args.resumo_conversa);
    const observacao = texto(args.observacao);

    const mensagem = [
      "📋 Lead qualificado — fazer análise",
      "",
      `Serviço: ${servico}`,
      `Objetivo: ${objetivo}`,
      ...(valorPretendido ? [`Valor pretendido: ${valorPretendido}`] : []),
      ...(capacidade ? [`Capacidade mensal: ${capacidade}`] : []),
      ...(prazo ? [`Prazo desejado: ${prazo}`] : []),
      ...(urgencia ? [`Urgência: ${urgencia}`] : []),
      "",
      "Dados do lead",
      ...linhasLead,
      `WhatsApp: ${formatarTelefone(conversa.phone)}${nomeCrm ? ` (${nomeCrm})` : ""}`,
      ...(resumo ? ["", `Conversa: ${resumo}`] : []),
      ...(observacao ? ["", `Obs.: ${observacao}`] : []),
      "",
      "Próximo passo: rodar as opções e voltar pro lead com as melhores.",
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
        ferramenta: "notificar_analise",
        enviado,
        destino,
        status_zapi: envio.status,
        servico,
        objetivo,
        resposta: corpoEnvio.slice(0, 300),
      },
    });

    if (!enviado) {
      return resp({
        ok: false,
        mensagem: `falha ao avisar a equipe (Z-API ${envio.status}). Chame transferir_humano com o motivo "fazer análise do lead".`,
      });
    }

    return resp({
      ok: true,
      mensagem: "Equipe avisada com os dados do lead. Diga ao lead que você vai levantar as melhores opções e já volta com elas.",
    });
  } catch (e) {
    return resp({ ok: false, mensagem: `erro interno: ${(e as Error).message}` });
  }
});

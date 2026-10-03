/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { criarClienteAdmin } from "../_shared/supabase.ts";
import {
  assinaturaValida,
  lerMensagensDoWebhook,
  lerStatusDoWebhook,
  normalizarTelefone,
  responderDesafio,
} from "../_shared/whatsapp-oficial.ts";

/**
 * webhook-whatsapp-oficial — a porta de entrada do Gerenciador de Leads (bloco 6, 2026-09-16).
 *
 * O número é da BABEL (Cloud API oficial da Meta), nunca do tenant. Quem manda mensagem
 * — em geral vindo de um anúncio Click-to-WhatsApp — vira `leads_babel` (status
 * `qualificando`) na campanha ativa da Babel; a 1ª mensagem traz o `ctwa_clid`, que é o
 * carimbo do anúncio e só chega uma vez — gravado na hora. Cada mensagem entra em
 * `ficha.mensagens[]`. A qualificação pelo agente da Babel entra em bloco próprio
 * (canal oficial no motor, lista-mãe 3.1); aqui é só receber, guardar e não perder nada.
 *
 * GET  = handshake da Meta (`hub.challenge`) com WHATSAPP_OFICIAL_VERIFY_TOKEN.
 * POST = mensagens (assinatura X-Hub-Signature-256 com WHATSAPP_OFICIAL_APP_SECRET) e
 *        status de entrega (só logados por enquanto).
 * verify_jwt=false — a Meta não manda JWT.
 */

const MAX_MENSAGENS_NA_FICHA = 50;

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const tokenEsperado = Deno.env.get("WHATSAPP_OFICIAL_VERIFY_TOKEN") ?? "";
    const desafio = tokenEsperado ? responderDesafio(url, tokenEsperado) : null;
    return desafio ?? json({ erro: "verify_token_invalido" }, 403);
  }
  if (req.method !== "POST") return json({ erro: "metodo" }, 405);

  const corpoBruto = await req.text();
  const segredo = Deno.env.get("WHATSAPP_OFICIAL_APP_SECRET") ?? "";
  if (!segredo) {
    console.error("[webhook-whatsapp-oficial] WHATSAPP_OFICIAL_APP_SECRET ausente — recusando tudo");
    return json({ erro: "sem_segredo" }, 500);
  }
  if (!(await assinaturaValida(corpoBruto, req.headers.get("x-hub-signature-256"), segredo))) {
    return json({ erro: "assinatura_invalida" }, 401);
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoBruto);
  } catch {
    return json({ erro: "json_invalido" }, 400);
  }

  const admin = criarClienteAdmin();
  const mensagens = lerMensagensDoWebhook(corpo);
  const status = lerStatusDoWebhook(corpo);
  for (const s of status) console.log(`[webhook-whatsapp-oficial] status ${s.status} wamid=${s.id} tel=${s.telefone}`);

  // Campanha da Babel que recebe: a ativa mais recente com origem 'anuncio_meta'.
  // (Quando houver mais de um número/anúncio, a escolha passa a olhar o ctwa_clid.)
  const { data: campanha } = await admin
    .from("campanhas_babel")
    .select("id")
    .eq("status", "ativa")
    .is("deleted_at", null)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const campanhaId = (campanha?.id as string | undefined) ?? null;

  let criados = 0, atualizados = 0;
  for (const m of mensagens) {
    const telefone = normalizarTelefone(m.telefone);
    if (!telefone) continue;
    const entrada = { id: m.id, em: m.em, tipo: m.tipo, texto: m.texto };

    let q = admin.from("leads_babel").select("id, ficha, ctwa_clid, nome").is("deleted_at", null).eq("phone", telefone);
    q = campanhaId ? q.eq("campanha_babel_id", campanhaId) : q.is("campanha_babel_id", null);
    const { data: existente } = await q.order("criado_em", { ascending: false }).limit(1).maybeSingle();

    if (existente) {
      const ficha = (existente.ficha ?? {}) as Record<string, unknown>;
      const lista = Array.isArray(ficha.mensagens) ? (ficha.mensagens as unknown[]) : [];
      if (lista.some((x) => (x as { id?: string })?.id === m.id)) continue; // a Meta repete webhook
      const novaFicha = { ...ficha, mensagens: [...lista, entrada].slice(-MAX_MENSAGENS_NA_FICHA) };
      const { error } = await admin.from("leads_babel").update({
        ficha: novaFicha,
        atualizado_em: new Date().toISOString(),
        ...(!existente.ctwa_clid && m.origemAnuncio?.ctwaClid ? { ctwa_clid: m.origemAnuncio.ctwaClid } : {}),
      }).eq("id", existente.id);
      if (error) console.error("[webhook-whatsapp-oficial] update falhou:", error.message);
      else atualizados++;
      continue;
    }

    const { error } = await admin.from("leads_babel").insert({
      campanha_babel_id: campanhaId,
      phone: telefone,
      nome: null,
      ctwa_clid: m.origemAnuncio?.ctwaClid ?? null,
      utm: m.origemAnuncio
        ? { id_origem: m.origemAnuncio.idOrigem, tipo: m.origemAnuncio.tipoOrigem, url: m.origemAnuncio.urlOrigem, titulo: m.origemAnuncio.titulo }
        : null,
      ficha: { mensagens: [entrada] },
      status: "qualificando",
    });
    if (error) console.error("[webhook-whatsapp-oficial] insert falhou:", error.message);
    else criados++;
  }

  if (!campanhaId && mensagens.length > 0) {
    console.warn("[webhook-whatsapp-oficial] nenhuma campanha_babel ativa — leads guardados sem campanha");
  }
  // A Meta espera 200 rápido; qualquer coisa diferente ela reenvia.
  return json({ ok: true, mensagens: mensagens.length, criados, atualizados, status: status.length });
});

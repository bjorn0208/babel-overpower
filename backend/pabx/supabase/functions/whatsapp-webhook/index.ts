// Porta de entrada do WhatsApp: o provedor bate aqui a cada mensagem recebida.
//
// É pública por natureza (quem chama é o provedor, não um usuário logado), então
// a defesa é um segredo na URL: ?t=<WHATSAPP_WEBHOOK_TOKEN>. Sem ele, 401 — sem
// isso qualquer um na internet escreveria mensagens falsas na caixa da equipe.
//
// Fala o formato do Z-API e o do Evolution. Os dois mandam JSON com nomes
// diferentes para as mesmas coisas; `lerMensagem` traduz para um formato só.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });

// só dígitos e sempre com 55: é a chave da conversa
function normalizar(tel: string): string {
  const d = String(tel || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  return d.startsWith("55") ? d : `55${d}`;
}

type Entrada = {
  telefone: string;
  nome?: string;
  externoId?: string;
  deMim: boolean;
  tipo: string;
  texto?: string;
  midiaUrl?: string;
  midiaMime?: string;
};

// Traduz o corpo do provedor para o nosso formato. Devolve null quando o evento
// não é mensagem (status de entrega, presença, conexão) — isso é normal e não
// pode virar erro no log do provedor, senão ele começa a repetir tudo.
function lerMensagem(b: any): Entrada | null {
  // ---- Evolution API: { event, data: { key, message, pushName } } ----
  if (b?.data?.key?.remoteJid) {
    const d = b.data;
    const jid = String(d.key.remoteJid);
    if (jid.endsWith("@g.us")) return null;          // grupo: fora do escopo
    const m = d.message || {};
    const texto = m.conversation || m.extendedTextMessage?.text
      || m.imageMessage?.caption || m.videoMessage?.caption || "";
    let tipo = "texto";
    if (m.imageMessage) tipo = "imagem";
    else if (m.audioMessage) tipo = "audio";
    else if (m.videoMessage) tipo = "video";
    else if (m.documentMessage) tipo = "documento";
    else if (m.stickerMessage) tipo = "figurinha";
    else if (m.locationMessage) tipo = "local";
    else if (m.contactMessage) tipo = "contato";
    if (tipo === "texto" && !texto) return null;
    return {
      telefone: normalizar(jid.split("@")[0]),
      nome: d.pushName || undefined,
      externoId: d.key.id ? String(d.key.id) : undefined,
      deMim: !!d.key.fromMe,
      tipo,
      texto: texto || undefined,
      midiaUrl: d.mediaUrl || undefined,
      midiaMime: m.imageMessage?.mimetype || m.audioMessage?.mimetype
        || m.videoMessage?.mimetype || m.documentMessage?.mimetype || undefined,
    };
  }

  // ---- Z-API: { phone, senderName, messageId, fromMe, text: { message } } ----
  if (b?.phone && (b.text || b.image || b.audio || b.video || b.document || b.sticker)) {
    let tipo = "texto";
    let midiaUrl: string | undefined;
    let midiaMime: string | undefined;
    if (b.image) { tipo = "imagem"; midiaUrl = b.image.imageUrl; midiaMime = b.image.mimeType; }
    else if (b.audio) { tipo = "audio"; midiaUrl = b.audio.audioUrl; midiaMime = b.audio.mimeType; }
    else if (b.video) { tipo = "video"; midiaUrl = b.video.videoUrl; midiaMime = b.video.mimeType; }
    else if (b.document) { tipo = "documento"; midiaUrl = b.document.documentUrl; midiaMime = b.document.mimeType; }
    else if (b.sticker) { tipo = "figurinha"; midiaUrl = b.sticker.stickerUrl; }
    const texto = b.text?.message || b.image?.caption || b.video?.caption || "";
    if (tipo === "texto" && !texto) return null;
    return {
      telefone: normalizar(b.phone),
      nome: b.senderName || b.chatName || undefined,
      externoId: b.messageId ? String(b.messageId) : undefined,
      deMim: !!b.fromMe,
      tipo,
      texto: texto || undefined,
      midiaUrl,
      midiaMime,
    };
  }

  return null;
}

Deno.serve(async (req) => {
  // o navegador pergunta antes de chamar; sem esta resposta ele desiste
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const esperado = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN");
  if (!esperado || url.searchParams.get("t") !== esperado) {
    return json({ erro: "não autorizado" }, 401);
  }

  let corpo: any;
  try { corpo = await req.json(); } catch { return json({ ok: true, ignorado: "sem json" }); }

  const msg = lerMensagem(corpo);
  // Evento que não é mensagem: responde 200 para o provedor não reenviar
  if (!msg || !msg.telefone) return json({ ok: true, ignorado: true });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // conversa: acha ou cria (o telefone é único, então isto nunca duplica)
  const { data: existente } = await admin
    .from("wa_conversas").select("id, nome").eq("telefone", msg.telefone).maybeSingle();

  let conversaId = existente?.id as string | undefined;
  if (!conversaId) {
    const { data: nova, error } = await admin.from("wa_conversas")
      .insert({ telefone: msg.telefone, nome: msg.nome ?? null })
      .select("id").single();
    if (error) return json({ erro: error.message }, 500);
    conversaId = nova.id;
    // amarra ao lead com o mesmo telefone, se existir
    await admin.rpc("wa_ligar_lead", { _conversa: conversaId });
  } else if (msg.nome && !existente?.nome) {
    await admin.from("wa_conversas").update({ nome: msg.nome }).eq("id", conversaId);
  }

  const { error: erroMsg } = await admin.from("wa_mensagens").insert({
    conversa_id: conversaId,
    externo_id: msg.externoId ?? null,
    de_mim: msg.deMim,
    tipo: msg.tipo,
    texto: msg.texto ?? null,
    midia_url: msg.midiaUrl ?? null,
    midia_mime: msg.midiaMime ?? null,
    status: msg.deMim ? "enviada" : "entregue",
  });

  // 23505 = mensagem repetida (o provedor reenviou). Não é erro: é o dedupe
  // funcionando, e precisa devolver 200 senão ele tenta de novo para sempre.
  if (erroMsg && !String(erroMsg.code).includes("23505")) {
    return json({ erro: erroMsg.message }, 500);
  }

  return json({ ok: true, conversa: conversaId, repetida: !!erroMsg });
});

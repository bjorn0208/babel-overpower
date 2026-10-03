export interface ZApiPayload {
  instanceId?: string;
  messageId?: string;
  referenceMessageId?: string;
  phone?: string;
  chatId?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  type?: string;
  body?: string;
  text?: { message?: string };
  image?: { imageUrl?: string; caption?: string; thumbnailUrl?: string };
  audio?: { audioUrl?: string; ptt?: boolean; seconds?: number };
  video?: { videoUrl?: string; caption?: string; seconds?: number };
  document?: { documentUrl?: string; fileName?: string; pageCount?: number; mimeType?: string };
  sticker?: { stickerUrl?: string };
  location?: { latitude?: number; longitude?: number; address?: string };
  contact?: { displayName?: string; phones?: string[]; vCard?: string };
  /** legado — alguns payloads antigos traziam sticker no topo */
  stickerUrl?: string;
  senderPhoto?: string;
  photo?: string;
  senderName?: string;
  status?: string;
  presence?: string;
  /** epoch ms do envio real da mensagem (nome do campo é assim mesmo na Z-API) */
  momment?: number;
}

export interface ChannelRow {
  id: string;
  user_id: string;
  zapi_instance_id: string;
  zapi_token: string;
  zapi_security_token: string;
  zapi_api_url: string;
  url_foto_perfil: string | null;
  updated_at?: string | null;
}

export function zapiBase(ch: ChannelRow): string {
  return `${ch.zapi_api_url}/instances/${ch.zapi_instance_id}/token/${ch.zapi_token}`;
}

export function zapiHeaders(ch: ChannelRow): Record<string, string> {
  return { "Content-Type": "application/json", "Client-Token": ch.zapi_security_token };
}

export async function sendZApi(channel: ChannelRow, phone: string, message: string): Promise<string | null> {
  const res = await fetch(`${zapiBase(channel)}/send-text`, {
    method: "POST",
    headers: zapiHeaders(channel),
    body: JSON.stringify({ phone, message }),
  });
  const resText = await res.text();
  if (!res.ok) console.warn(`[ZAPI] send-text falhou status=${res.status} phone=${phone} resp=${resText.slice(0, 200)}`);
  try { const p = JSON.parse(resText); return p.zapiMessageId || p.messageId || null; } catch { return null; }
}

export async function sendZApiImage(channel: ChannelRow, phone: string, imageUrl: string, caption?: string): Promise<string | null> {
  const res = await fetch(`${zapiBase(channel)}/send-image`, {
    method: "POST",
    headers: zapiHeaders(channel),
    body: JSON.stringify({ phone, image: imageUrl, ...(caption ? { caption } : {}) }),
  });
  try { const p = await res.json(); return p.zapiMessageId || p.messageId || null; } catch { return null; }
}

export async function sendZApiVideo(channel: ChannelRow, phone: string, videoUrl: string, caption?: string): Promise<string | null> {
  const res = await fetch(`${zapiBase(channel)}/send-video`, {
    method: "POST",
    headers: zapiHeaders(channel),
    body: JSON.stringify({ phone, video: videoUrl, ...(caption ? { caption } : {}) }),
  });
  try { const p = await res.json(); return p.zapiMessageId || p.messageId || null; } catch { return null; }
}

export async function sendZApiAudio(channel: ChannelRow, phone: string, audioUrl: string): Promise<string | null> {
  const res = await fetch(`${zapiBase(channel)}/send-audio`, {
    method: "POST",
    headers: zapiHeaders(channel),
    body: JSON.stringify({ phone, audio: audioUrl }),
  });
  try { const p = await res.json(); return p.zapiMessageId || p.messageId || null; } catch { return null; }
}

export async function sendZApiDocument(channel: ChannelRow, phone: string, docUrl: string, fileName?: string): Promise<string | null> {
  const ext = (fileName || docUrl).split(".").pop() || "pdf";
  const res = await fetch(`${zapiBase(channel)}/send-document/${ext}`, {
    method: "POST",
    headers: zapiHeaders(channel),
    body: JSON.stringify({ phone, document: docUrl, fileName: fileName || "arquivo" }),
  });
  try { const p = await res.json(); return p.zapiMessageId || p.messageId || null; } catch { return null; }
}

export async function sendZApiMedia(channel: ChannelRow, phone: string, url: string, tipo: string, caption?: string): Promise<string | null> {
  if (tipo === "video" || tipo === "video/mp4") return sendZApiVideo(channel, phone, url, caption);
  if (tipo === "audio" || tipo.startsWith("audio/")) return sendZApiAudio(channel, phone, url);
  if (tipo === "pdf" || tipo === "document" || tipo === "application/pdf") return sendZApiDocument(channel, phone, url);
  return sendZApiImage(channel, phone, url, caption);
}

export function extractMessage(body: ZApiPayload): { text: string; mediaUrl: string | null; mediaType: string; extra?: Record<string, unknown> } {
  if (body.image?.imageUrl) return { text: body.image.caption || "", mediaUrl: body.image.imageUrl, mediaType: "image" };
  if (body.audio?.audioUrl) return { text: "", mediaUrl: body.audio.audioUrl, mediaType: "audio" };
  if (body.video?.videoUrl) return { text: body.video.caption || "", mediaUrl: body.video.videoUrl, mediaType: "video" };
  if (body.document?.documentUrl) {
    return {
      text: "",
      mediaUrl: body.document.documentUrl,
      mediaType: "document",
      extra: body.document.fileName ? { file_name: body.document.fileName } : undefined,
    };
  }
  if (body.sticker?.stickerUrl) return { text: "", mediaUrl: body.sticker.stickerUrl, mediaType: "sticker" };
  if (typeof body.location?.latitude === "number") {
    return {
      text: body.location.address || "",
      mediaUrl: null,
      mediaType: "location",
      extra: {
        local: {
          lat: body.location.latitude,
          lng: body.location.longitude ?? 0,
          endereco: body.location.address ?? undefined,
        },
      },
    };
  }
  if (body.contact?.displayName) {
    return {
      text: "",
      mediaUrl: null,
      mediaType: "contact",
      extra: {
        contato: {
          nome: body.contact.displayName,
          telefones: Array.isArray(body.contact.phones) ? body.contact.phones : [],
        },
      },
    };
  }
  const text = body.body || body.text?.message || "";
  return { text, mediaUrl: null, mediaType: "" };
}

function validUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v || v === "null") return null;
  return v.startsWith("http") ? v : null;
}

export async function sendTypingStatus(channel: ChannelRow, phone: string): Promise<void> {
  const url = `${zapiBase(channel)}/send-typing`;
  await fetch(url, {
    method: "POST",
    headers: zapiHeaders(channel),
    body: JSON.stringify({ phone }),
  }).catch(() => {});
}

export function isExpirableCdnUrl(url: string | null): boolean {
  if (!url) return false;
  return url.includes("pps.whatsapp.net") || url.includes("mmg.whatsapp.net");
}

// deno-lint-ignore no-explicit-any
export async function persistPhoto(supabaseClient: any, cdnUrl: string, storagePath: string): Promise<string | null> {
  try {
    const res = await fetch(cdnUrl);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const { error } = await supabaseClient.storage
      .from("fotos-perfil")
      .upload(storagePath, new Uint8Array(arrayBuf), { contentType, upsert: true });
    if (error) return null;
    const { data } = supabaseClient.storage.from("fotos-perfil").getPublicUrl(storagePath);
    return data.publicUrl;
  } catch { return null; }
}


/**
 * Re-hospeda a mídia recebida do Z-API no Supabase Storage da conta.
 *
 * URLs de mídia do Z-API expiram em ~30 dias (dossiê
 * agent-output/dossies/zapi-midia-completo-2026-05-18.md). Baixamos no ato
 * e salvamos no bucket público `anexos-chat`, path
 * `{tenantId}/{conversaId}/recebido-{ts}.{ext}` — o `conversation_id` é
 * sempre o 2º segmento, o que a cascata de exclusão usa pra varrer
 * (`split_part(name,'/',2)`).
 *
 * Webhook roda como service_role → bypassa RLS do Storage. Em qualquer
 * falha de download/upload devolve null e o caller faz fallback pra URL
 * crua do Z-API (degradação graciosa — funciona por ~30 dias).
 */
// deno-lint-ignore no-explicit-any
export async function rehospedarMidia(
  supabaseClient: any,
  urlZApi: string,
  mediaType: string,
  tenantId: string,
  conversaId: string,
): Promise<string | null> {
  try {
    const res = await fetch(urlZApi);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const ext = contentType.split("/")[1]?.split(";")[0]?.replace("+", "") || mediaType || "bin";
    const path = `${tenantId}/${conversaId}/recebido-${Date.now()}.${ext}`;
    const { error } = await supabaseClient.storage
      .from("anexos-chat")
      .upload(path, new Uint8Array(arrayBuf), { contentType, upsert: false });
    if (error) return null;
    const { data } = supabaseClient.storage.from("anexos-chat").getPublicUrl(path);
    return data.publicUrl ?? null;
  } catch {
    return null;
  }
}

export async function fetchProfilePicture(channel: ChannelRow, phone: string): Promise<string | null> {
  try {
    const res = await fetch(`${zapiBase(channel)}/profile-picture?phone=${phone}`, {
      headers: { "Client-Token": channel.zapi_security_token },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.link) return validUrl(data[0].link);
    if (data?.link) return validUrl(data.link);
    return null;
  } catch { return null; }
}

// deno-lint-ignore no-explicit-any
export async function ensureReceivedByMe(supabaseClient: any, channel: ChannelRow): Promise<void> {
  try {
    const cacheKey = `zapi_rbm_${channel.zapi_instance_id}`;
    const { data: existing } = await supabaseClient.from("cache_kv")
      .select("id").eq("key", cacheKey).maybeSingle();
    if (existing) return; // ja configurado

    const base = zapiBase(channel);
    const headers = zapiHeaders(channel);

    // Ativar notifySentByMe na Z-API (mensagens enviadas pelo dono do numero)
    await fetch(`${base}/update-notify-sent-by-me`, {
      method: "PUT", headers,
      body: JSON.stringify({ notifySentByMe: true }),
    });

    // Marcar como configurado
    await supabaseClient.from("cache_kv")
      .upsert({ key: cacheKey, value: { configured: true }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch (_) { /* nunca bloquear o fluxo principal */ }
}

export async function fetchChannelPhoto(channel: ChannelRow): Promise<string | null> {
  try {
    const res = await fetch(`${zapiBase(channel)}/device`, {
      headers: { "Client-Token": channel.zapi_security_token },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (validUrl(data?.imgUrl)) return data.imgUrl;
    if (data?.phone) return await fetchProfilePicture(channel, data.phone);
    return null;
  } catch { return null; }
}

// deno-lint-ignore no-explicit-any
export async function resolveLidToPhone(supabaseClient: any, channel: ChannelRow, lidPhone: string): Promise<string | null> {
  if (!lidPhone.includes("@lid")) return lidPhone;
  const lid = lidPhone.split("@")[0];
  const cacheKey = `lid_map_${channel.zapi_instance_id}_${lid}`;
  const { data: cached } = await supabaseClient
    .from("cache_kv").select("value").eq("key", cacheKey).maybeSingle();
  if (cached?.value?.phone) return cached.value.phone as string;
  try {
    const res = await fetch(`${zapiBase(channel)}/chats?page=1&pageSize=500`, {
      headers: { "Client-Token": channel.zapi_security_token },
    });
    if (!res.ok) return null;
    const chats = await res.json();
    if (!Array.isArray(chats)) return null;
    let resolved: string | null = null;
    const upserts: { key: string; value: { phone: string }; updated_at: string }[] = [];
    for (const chat of chats) {
      const cLid = typeof chat?.lid === "string" ? chat.lid.split("@")[0] : null;
      const cPhone = typeof chat?.phone === "string" ? chat.phone : null;
      if (!cLid || !cPhone) continue;
      upserts.push({
        key: `lid_map_${channel.zapi_instance_id}_${cLid}`,
        value: { phone: cPhone },
        updated_at: new Date().toISOString(),
      });
      if (cLid === lid) resolved = cPhone;
    }
    if (upserts.length) {
      await supabaseClient.from("cache_kv").upsert(upserts, { onConflict: "key" });
    }
    return resolved;
  } catch { return null; }
}

// Resolve um LID *cru* (ex: "103032675111080", sem sufixo @lid) para o número
// real consultando APENAS o cache de mapa (cache_kv) — sem fetch /chats.
// Usado no caminho de presence: o Z-API manda COMPOSING/UNAVAILABLE com o LID
// cru, mas AVAILABLE e as mensagens com o número. O mapa é populado pelo
// webhook a cada mensagem recebida (que traz phone + chatLid juntos), então
// cache miss aqui = manter o valor como veio (provável número real).
// deno-lint-ignore no-explicit-any
export async function mapearLidViaCache(supabaseClient: any, channel: ChannelRow, lidCru: string): Promise<string | null> {
  const lid = lidCru.split("@")[0];
  const { data: cached } = await supabaseClient
    .from("cache_kv").select("value").eq("key", `lid_map_${channel.zapi_instance_id}_${lid}`).maybeSingle();
  const phone = cached?.value?.phone;
  return typeof phone === "string" ? phone : null;
}

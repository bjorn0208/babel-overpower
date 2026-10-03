// Helper Google Agenda — usado pelas edges google-oauth-retorno e
// google-agendar-evento. Endpoints canônicos do OAuth2 e do Calendar v3.

const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_CALENDARIOS = "https://www.googleapis.com/calendar/v3";

export interface TokensGoogle {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

/** Troca o code do consentimento por tokens (1ª conexão). */
export async function trocarCodePorTokens(code: string, redirectUri: string): Promise<TokensGoogle> {
  const res = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`troca de code falhou (http ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return await res.json() as TokensGoogle;
}

/** Renova o access token a partir do refresh_token guardado. */
export async function renovarAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`renovação de token falhou (http ${res.status}): ${(await res.text()).slice(0, 200)}`);
  const corpo = await res.json() as TokensGoogle;
  return corpo.access_token;
}

/** E-mail do dono direto do id_token (payload base64) — sem chamada extra. */
export function emailDoIdToken(idToken: string | undefined): string | null {
  try {
    if (!idToken) return null;
    const payload = JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/** Acha o calendário "Babel OS" do dono; cria se não existir. Devolve o id. */
export async function garantirCalendarioBabel(accessToken: string): Promise<string> {
  const auth = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const lista = await fetch(`${URL_CALENDARIOS}/users/me/calendarList?minAccessRole=writer&maxResults=250`, { headers: auth });
  if (lista.ok) {
    const corpo = await lista.json() as { items?: Array<{ id: string; summary?: string }> };
    const existente = (corpo.items ?? []).find((c) => (c.summary ?? "").trim().toLowerCase() === "babel os");
    if (existente) return existente.id;
  }
  const criado = await fetch(`${URL_CALENDARIOS}/calendars`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ summary: "Babel OS", description: "Compromissos da Babel (retornos e follow-ups do agente)." }),
  });
  if (!criado.ok) throw new Error(`criar calendário Babel OS falhou (http ${criado.status}): ${(await criado.text()).slice(0, 200)}`);
  const corpo = await criado.json() as { id: string };
  return corpo.id;
}

/** Cria um evento no calendário indicado. Devolve id + link do evento. */
export async function criarEvento(
  accessToken: string,
  calendarioId: string,
  evento: { titulo: string; descricao?: string | null; inicioIso: string; duracaoMin?: number; convidadoEmail?: string | null },
): Promise<{ id: string; htmlLink: string }> {
  const inicio = new Date(evento.inicioIso);
  if (Number.isNaN(inicio.getTime())) throw new Error("inicio inválido (esperado ISO 8601)");
  const fim = new Date(inicio.getTime() + (evento.duracaoMin ?? 30) * 60_000);
  const res = await fetch(`${URL_CALENDARIOS}/calendars/${encodeURIComponent(calendarioId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: evento.titulo,
      description: evento.descricao ?? undefined,
      start: { dateTime: inicio.toISOString() },
      end: { dateTime: fim.toISOString() },
      attendees: evento.convidadoEmail ? [{ email: evento.convidadoEmail }] : undefined,
    }),
  });
  if (!res.ok) throw new Error(`criar evento falhou (http ${res.status}): ${(await res.text()).slice(0, 200)}`);
  const corpo = await res.json() as { id: string; htmlLink: string };
  return { id: corpo.id, htmlLink: corpo.htmlLink };
}

/** State assinado (HMAC-SHA256 com a service key) pro fluxo OAuth — sem tabela extra. */
export async function assinarState(tenantId: string, validadeMin = 15): Promise<string> {
  const expira = Date.now() + validadeMin * 60_000;
  const corpo = `${tenantId}.${expira}`;
  const chave = await chaveHmac();
  const ass = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo));
  return `${corpo}.${base64Url(new Uint8Array(ass))}`;
}

export async function validarState(state: string): Promise<string | null> {
  const partes = state.split(".");
  if (partes.length !== 3) return null;
  const [tenantId, expira, assinatura] = partes;
  if (Number(expira) < Date.now()) return null;
  const chave = await chaveHmac();
  const esperada = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${tenantId}.${expira}`));
  return base64Url(new Uint8Array(esperada)) === assinatura ? tenantId : null;
}

async function chaveHmac(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

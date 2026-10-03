/**
 * _shared/midia-gemini.ts
 *
 * B3 (2026-05-24) — interpreta mídia do lead (áudio/imagem/PDF) via Gemini multimodal
 * no OpenRouter. Áudio → transcrição; imagem → descrição (com texto/print legível);
 * PDF → leitura/resumo. Vídeo NÃO (decisão Theus).
 *
 * Resiliente: retry com backoff no modelo primário + fallback pra um 2º modelo
 * (params.modeloFallback) — a falha de mídia é majoritariamente intermitente, não de
 * formato. Só após esgotar tudo retorna "" (o motor segue o turno e o agente pede pra
 * mandar por texto, em vez de quebrar ou ignorar).
 *
 * Formato multimodal do OpenRouter (confirmado via Context7 2026-05-24):
 *   content: [
 *     { type: "text", text },
 *     { type: "image_url",   image_url:   { url } },                              // imagem (URL ou data URI)
 *     { type: "input_audio", input_audio: { data: base64, format } },            // áudio
 *     { type: "file",        file:        { filename, file_data: "data:...;base64,.." } }, // PDF
 *   ]
 *
 * Baixa toda mídia e manda inline em base64 (data URI) pra não depender de a URL
 * de Storage ser pública/alcançável pelo provedor.
 */

export type TipoMidia = "audio" | "image" | "pdf" | "outro";

/** Classifica o tipo de mídia a partir do media_type/URL que o webhook passou. */
export function classificarMidia(mediaType: string | null | undefined, url = ""): TipoMidia {
  const t = `${mediaType ?? ""} ${url}`.toLowerCase();
  if (/audio|voice|ptt|ogg|opus|mp3|mpeg|m4a|mp4a|wav|aac|amr|flac/.test(t)) return "audio";
  if (/image|img|photo|sticker|jpe?g|png|webp|gif|bmp|heic/.test(t)) return "image";
  if (/pdf|document|msword|officedocument|application\/octet/.test(t)) return "pdf";
  return "outro";
}

/** Rótulo humano do tipo de mídia (pro texto que o agente vê). */
export function rotuloMidia(mediaType: string | null | undefined, url = ""): string {
  switch (classificarMidia(mediaType, url)) {
    case "audio": return "Áudio";
    case "image": return "Imagem";
    case "pdf": return "Documento PDF";
    default: return "Anexo";
  }
}

/** Formato de áudio aceito pelo provedor (WhatsApp/Z-API costuma mandar ogg/opus). */
function formatoAudio(mediaType: string | null | undefined, url: string): string {
  const t = `${mediaType ?? ""} ${url}`.toLowerCase();
  if (/opus/.test(t)) return "opus";
  if (/ogg/.test(t)) return "ogg";
  if (/mp3|mpeg/.test(t)) return "mp3";
  if (/m4a|mp4a/.test(t)) return "m4a";
  if (/wav/.test(t)) return "wav";
  if (/aac/.test(t)) return "aac";
  if (/amr/.test(t)) return "amr";
  if (/flac/.test(t)) return "flac";
  return "ogg"; // default WhatsApp voice
}

/** MIME da imagem pro data URI. */
function mimeImagem(mediaType: string | null | undefined, url: string): string {
  const t = `${mediaType ?? ""} ${url}`.toLowerCase();
  if (/png/.test(t)) return "image/png";
  if (/webp/.test(t)) return "image/webp";
  if (/gif/.test(t)) return "image/gif";
  if (/heic/.test(t)) return "image/heic";
  return "image/jpeg";
}

type ParamsMidia = {
  mediaUrl: string;
  mediaType?: string | null;
  apiKey: string;
  /** base_url do provedor (ex: https://openrouter.ai/api/v1) — sem /chat/completions. */
  baseUrl: string;
  modelo: string;
  /** Modelo de fallback usado se o primário esgotar as tentativas (ex: google/gemini-3.5-flash). */
  modeloFallback?: string;
  /** Tentativas por modelo antes de passar pro próximo (default 2). */
  tentativas?: number;
  /**
   * Instrução customizada de leitura (usada em imagem/PDF; áudio segue transcrição).
   * Ex.: extração estruturada de documento financeiro. Ausente = instruções default.
   */
  instrucao?: string;
  fetchFn?: typeof fetch;
};

/** Baixa a mídia e devolve em base64 (chunked pra não estourar a pilha em arquivos grandes). */
async function baixarBase64(url: string, fetchFn: typeof fetch): Promise<string> {
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`download mídia ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Interpreta a mídia e devolve um texto em PT-BR (transcrição/descrição/leitura).
 * Retorna "" se o tipo não for suportado (vídeo/outro) ou em qualquer falha não fatal.
 */
export async function interpretarMidia(params: ParamsMidia): Promise<string> {
  const fetchFn = params.fetchFn ?? fetch;
  const tipo = classificarMidia(params.mediaType, params.mediaUrl);
  if (tipo === "outro") return "";

  // deno-lint-ignore no-explicit-any
  let parteMidia: any;
  let instrucao: string;

  if (tipo === "audio") {
    const data = await baixarBase64(params.mediaUrl, fetchFn);
    parteMidia = { type: "input_audio", input_audio: { data, format: formatoAudio(params.mediaType, params.mediaUrl) } };
    instrucao = "Transcreva FIELMENTE este áudio em português brasileiro. Devolva só a transcrição limpa, sem comentar nem rotular.";
  } else if (tipo === "image") {
    const data = await baixarBase64(params.mediaUrl, fetchFn);
    const mime = mimeImagem(params.mediaType, params.mediaUrl);
    parteMidia = { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } };
    instrucao = params.instrucao ??
      ("Descreva objetivamente o que aparece nesta imagem (documento, print, comprovante, foto). " +
        "Se houver QUALQUER texto, transcreva-o por completo. Português brasileiro, direto ao ponto.");
  } else {
    // pdf
    const data = await baixarBase64(params.mediaUrl, fetchFn);
    parteMidia = { type: "file", file: { filename: "documento.pdf", file_data: `data:application/pdf;base64,${data}` } };
    instrucao = params.instrucao ??
      ("Leia este PDF e resuma o conteúdo relevante (dados, valores, nomes, datas, cláusulas). " +
        "Se for um comprovante/documento, extraia os campos importantes. Português brasileiro, objetivo.");
  }

  // Uma chamada ao provedor com um modelo específico. Lança em erro HTTP ou resposta vazia
  // (pra ambos contarem como falha e disparar retry/fallback).
  async function chamarModelo(modelo: string): Promise<string> {
    const body: Record<string, unknown> = {
      model: modelo,
      messages: [{ role: "user", content: [{ type: "text", text: instrucao }, parteMidia] }],
      temperature: 0.2,
      max_tokens: 700,
    };
    const r = await fetchFn(`${params.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://plataformalimpa.com.br",
        "X-Title": "Plataforma Limpa · mídia",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`mídia ${tipo} ${r.status} ${(await r.text()).slice(0, 200)}`);
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    const txt = ((j.choices?.[0]?.message?.content as string) ?? "").trim();
    if (!txt) throw new Error(`mídia ${tipo} resposta vazia`);
    return txt;
  }

  // Sequência de tentativas: N no modelo primário, depois N no fallback (se houver e for
  // diferente). Backoff crescente entre tentativas — a falha de mídia é majoritariamente
  // intermitente (rate-limit/timeout/5xx do provedor), não de formato. A mídia já está
  // baixada em base64 (reusada em todas as tentativas — sem re-download).
  const tentativas = Math.max(1, params.tentativas ?? 2);
  const modelos = [
    params.modelo,
    ...(params.modeloFallback && params.modeloFallback !== params.modelo ? [params.modeloFallback] : []),
  ];
  const sequencia = modelos.flatMap((m) => Array<string>(tentativas).fill(m));

  let ultimoErro = "";
  for (let k = 0; k < sequencia.length; k++) {
    if (k > 0) await new Promise((res) => setTimeout(res, Math.min(600 * k, 2000)));
    try {
      return await chamarModelo(sequencia[k]);
    } catch (e) {
      ultimoErro = (e as Error).message;
    }
  }
  console.warn(`[midia-gemini] ${tipo}: esgotou ${sequencia.length} tentativa(s) — ${ultimoErro}`);
  return "";
}

/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * transcrever-audio-mentor — transcreve o áudio gravado pelo dono no chat
 * Mentor (commandbar) e devolve o texto pra virar mensagem normal.
 *
 * Fluxo: front grava (MediaRecorder webm/opus) → manda base64 aqui →
 * Gemini multimodal via OpenRouter (mesmo caminho do áudio de lead em
 * `_shared/midia-gemini.ts`) → { ok, texto }.
 *
 * verify_jwt = true (só o dono logado chama). Credencial em `provedores_llm`.
 */

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

const MODELO_PRIMARIO = "google/gemini-2.5-flash";
const MODELO_FALLBACK = "google/gemini-3.5-flash";
/** ~10 MB de áudio (base64 ≈ 13,4 MB) — muito acima de um comando de voz. */
const MAX_BASE64 = 14_000_000;

const INSTRUCAO =
  "Transcreva FIELMENTE este áudio em português brasileiro. " +
  "Devolva só a transcrição limpa, sem comentar nem rotular.";

async function transcrever(
  baseUrl: string,
  apiKey: string,
  modelo: string,
  data: string,
  formato: string,
): Promise<string> {
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://plataformalimpa.com.br",
      "X-Title": "Plataforma Limpa · voz do Mentor",
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: INSTRUCAO },
          { type: "input_audio", input_audio: { data, format: formato } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 700,
    }),
  });
  if (!r.ok) throw new Error(`transcrição ${modelo} ${r.status} ${(await r.text()).slice(0, 160)}`);
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json();
  const texto = ((j.choices?.[0]?.message?.content as string) ?? "").trim();
  if (!texto) throw new Error(`transcrição ${modelo} vazia`);
  return texto;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsOk();
  if (req.method !== "POST") return jsonRes({ ok: false, erro: "método inválido" }, 405);

  try {
    const body = await req.json().catch(() => null) as
      | { audio_base64?: string; formato?: string }
      | null;
    const audio = body?.audio_base64 ?? "";
    if (!audio) return jsonRes({ ok: false, erro: "audio_base64 obrigatório" }, 400);
    if (audio.length > MAX_BASE64) {
      return jsonRes({ ok: false, erro: "áudio grande demais — grave um comando mais curto" }, 413);
    }
    // MediaRecorder do navegador grava webm/opus; Gemini aceita como opus.
    const formato = (body?.formato ?? "opus").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "opus";

    const admin = criarClienteAdmin();
    const { data: prov, error } = await admin
      .from("provedores_llm")
      .select("base_url, api_key")
      .eq("slug", "openrouter")
      .eq("is_active", true)
      .single();
    if (error || !prov?.api_key) return jsonRes({ ok: false, erro: "provedor openrouter ausente" }, 500);

    let texto: string;
    try {
      texto = await transcrever(prov.base_url, prov.api_key, MODELO_PRIMARIO, audio, formato);
    } catch (e1) {
      console.warn("[transcrever-audio-mentor] primário falhou:", (e1 as Error).message);
      texto = await transcrever(prov.base_url, prov.api_key, MODELO_FALLBACK, audio, formato);
    }
    return jsonRes({ ok: true, texto });
  } catch (e) {
    console.error("[transcrever-audio-mentor]", (e as Error).message);
    return jsonRes({ ok: false, erro: "falha na transcrição — tente de novo" }, 500);
  }
});

/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Wrapper Gemini 2.0 Flash via OpenRouter — usado pelas tarefas de curadoria LLM (consolidar episódio + destilar insight)
// Lê API key do banco (provedores_llm slug='openrouter') em vez de env var.

const MODEL = "google/gemini-2.0-flash-001";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

let cachedKey: string | null = null;

export async function getOpenRouterKey(supabase: SupabaseClient): Promise<string> {
  if (cachedKey) return cachedKey;
  const env = Deno.env.get("OPENROUTER_API_KEY");
  if (env) {
    cachedKey = env;
    return env;
  }
  const { data } = await supabase
    .from("provedores_llm")
    .select("api_key")
    .eq("slug", "openrouter")
    .eq("is_active", true)
    .maybeSingle();
  const k = (data?.api_key as string | undefined) ?? "";
  cachedKey = k;
  return k;
}

export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export type LLMCallResult = {
  ok: boolean;
  text: string;
  raw?: unknown;
  motivo?: string;
};

export async function callLLM(
  supabase: SupabaseClient,
  messages: LLMMessage[],
  opts: { temperature?: number; max_tokens?: number; json_mode?: boolean } = {},
): Promise<LLMCallResult> {
  const apiKey = await getOpenRouterKey(supabase);
  if (!apiKey) {
    return { ok: false, text: "", motivo: "openrouter_key_indisponivel (env+provedores_llm vazios)" };
  }

  try {
    const body: Record<string, unknown> = {
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.max_tokens ?? 1024,
    };
    if (opts.json_mode) {
      body.response_format = { type: "json_object" };
    }

    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://plataforma-limpa.com",
        "X-Title": "cron-curadoria-llm",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text();
      return { ok: false, text: "", motivo: `openrouter ${r.status}: ${errText.slice(0, 300)}` };
    }

    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text, raw: data };
  } catch (e) {
    return { ok: false, text: "", motivo: `exception: ${(e as Error).message}` };
  }
}

export function tentarParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * melhorar-prompt — reescreve um bloco de conhecimento com clareza e estrutura
 * usando modelo GRÁTIS do OpenRouter (cinto de segurança max_price = 0).
 *
 * POST { titulo: string, conteudo: string }
 * → 200 { melhorado: string, sugestao: string, modelo: string, gratis: true }
 *
 * verify_jwt = true (chamada pelo frontend logado). Chave via env OPENROUTER_API_KEY —
 * nunca no frontend. Se o modelo deixar de ser grátis, o OpenRouter recusa em vez de cobrar.
 */

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

/**
 * Cascata de modelos GRÁTIS: tenta em ordem e usa o primeiro que responder.
 * Modelos :free vivem saturando (429 upstream) — cascata evita botão morto.
 * Lista validada na API pública /models do OpenRouter em 2026-07-10.
 */
const MODELOS: Array<{ slug: string; rotulo: string }> = [
  { slug: "meta-llama/llama-3.3-70b-instruct:free", rotulo: "Llama 3.3 70B" },
  { slug: "openai/gpt-oss-120b:free", rotulo: "GPT-OSS 120B" },
  { slug: "qwen/qwen3-next-80b-a3b-instruct:free", rotulo: "Qwen3 Next 80B" },
  { slug: "google/gemma-4-31b-it:free", rotulo: "Gemma 4 31B" },
  { slug: "nousresearch/hermes-3-llama-3.1-405b:free", rotulo: "Hermes 3 405B" },
];

const PROMPT_SISTEMA = `Você é especialista em escrever blocos de base de conhecimento pra agentes de IA de atendimento.
Receberá o título e o conteúdo de um bloco escrito por um dono de negócio.
Sua tarefa:
1. Reescrever o conteúdo deixando claro, específico e estruturado — mantendo TODA a intenção e os fatos originais, sem inventar informação nova.
2. Propor UMA sugestão complementar curta que faça sentido pro que foi escrito (um fato que costuma faltar ou um detalhe que deixaria o bloco mais completo).
Escreva em português do Brasil.
Responda APENAS com JSON válido neste formato, sem markdown e sem cercas de código:
{"melhorado":"...","sugestao":"..."}`;

type Carga = { titulo?: string; conteudo?: string; modelo?: string };

/**
 * Primeira tentativa: NVIDIA Nemotron 3 Ultra (API gratuita build.nvidia.com).
 * Thinking desligado (senão leva minutos) e timeout de 90s — falhou por qualquer
 * motivo (sem chave, 429, timeout, JSON inválido), devolve null e a cascata
 * grátis do OpenRouter assume. NVIDIA sumir = nada quebra.
 */
async function chamarNvidia(
  mensagens: Array<{ role: string; content: string }>,
): Promise<{ melhorado: string; sugestao: string } | null> {
  const chave = (Deno.env.get("NVIDIA_API_KEY") ?? "").trim();
  if (!chave) return null;
  try {
    const resposta = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        messages: mensagens,
        max_tokens: 1600,
        temperature: 0.3,
        top_p: 0.95,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!resposta.ok) {
      console.warn(`melhorar-prompt: NVIDIA HTTP ${resposta.status} — caindo pra cascata grátis`);
      return null;
    }
    const dados = await resposta.json();
    const msg = dados?.choices?.[0]?.message;
    const bruto: string = (msg?.content?.trim() || msg?.reasoning_content?.trim()) ?? "";
    const json = extrairJson(bruto);
    if (!json?.melhorado) {
      console.warn(`melhorar-prompt: NVIDIA sem JSON válido: ${bruto.slice(0, 120)}`);
      return null;
    }
    return { melhorado: json.melhorado.trim(), sugestao: (json.sugestao ?? "").trim() };
  } catch (err) {
    console.warn("melhorar-prompt: NVIDIA falhou — caindo pra cascata grátis", String(err));
    return null;
  }
}

/** Extrai o JSON da resposta do modelo mesmo se vier com cerca de código ou texto em volta. */
function extrairJson(bruto: string): { melhorado?: string; sugestao?: string } | null {
  const semCerca = bruto.replace(/```json|```/g, "").trim();
  const inicio = semCerca.indexOf("{");
  const fim = semCerca.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) return null;
  try {
    return JSON.parse(semCerca.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const { titulo, conteudo, modelo } = (await req.json()) as Carga;
    if (!conteudo || typeof conteudo !== "string" || conteudo.trim() === "") {
      return jsonRes({ error: "Envie o conteúdo do bloco." }, 400);
    }

    // Chave OpenRouter: env primeiro, fallback provedores_llm (padrão da casa).
    let apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
    if (!apiKey) {
      const { data: provedor } = await criarClienteAdmin()
        .from("provedores_llm")
        .select("api_key, is_active")
        .eq("slug", "openrouter")
        .single();
      if (provedor?.is_active && provedor.api_key) apiKey = provedor.api_key;
    }
    apiKey = apiKey.trim().replace(/[\r\n\t]/g, "");
    if (!apiKey) {
      return jsonRes({ error: "Chave do OpenRouter não configurada." }, 503);
    }

    const mensagens = [
      { role: "system", content: PROMPT_SISTEMA },
      {
        role: "user",
        content: `Título: ${(titulo ?? "").trim()}\n\nConteúdo:\n${conteudo.trim()}`,
      },
    ];

    // NVIDIA primeiro (decisão Theus 2026-07-14): grátis e melhor qualidade;
    // tarefa de bastidor tolera a latência. Falhou → cascata grátis abaixo.
    const nvidia = await chamarNvidia(mensagens);
    if (nvidia) {
      return jsonRes({
        melhorado: nvidia.melhorado,
        sugestao: nvidia.sugestao,
        modelo: "Nemotron 3 Ultra (NVIDIA)",
        gratis: true,
      });
    }

    // Modelo escolhido pelo tenant (só :free) vai pro topo; cascata segue de reserva.
    let fila = MODELOS;
    if (typeof modelo === "string" && modelo.endsWith(":free")) {
      const rotulo = modelo.split("/").pop()!.replace(":free", "");
      fila = [{ slug: modelo, rotulo }, ...MODELOS.filter((m) => m.slug !== modelo)];
    }

    const falhas: string[] = [];
    for (const { slug, rotulo } of fila) {
      const resposta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: slug,
          messages: mensagens,
          max_tokens: 1600,
          temperature: 0.3,
          // Cinto de segurança: só executa se for de graça — senão o OpenRouter recusa.
          provider: { max_price: { prompt: 0, completion: 0 } },
        }),
      });

      if (!resposta.ok) {
        falhas.push(`${slug} → HTTP ${resposta.status}: ${(await resposta.text()).slice(0, 160)}`);
        continue;
      }

      const dados = await resposta.json();
      const msg = dados?.choices?.[0]?.message;
      // Modelos de raciocínio às vezes devolvem content vazio e o texto em `reasoning`.
      const bruto: string = (msg?.content?.trim() || msg?.reasoning?.trim()) ?? "";
      const json = extrairJson(bruto);

      if (!json?.melhorado) {
        falhas.push(`${slug} → sem JSON válido: ${bruto.slice(0, 120)}`);
        continue;
      }

      return jsonRes({
        melhorado: json.melhorado.trim(),
        sugestao: (json.sugestao ?? "").trim(),
        modelo: rotulo,
        gratis: true,
      });
    }

    console.error("melhorar-prompt: todos os modelos grátis falharam", falhas.join(" | "));
    return jsonRes(
      { error: "Os modelos grátis estão saturados agora. Tenta de novo em 1 minuto.", detalhe: falhas.join(" | ") },
      502,
    );
  } catch (err) {
    console.error("melhorar-prompt: erro interno", err);
    return jsonRes({ error: "Erro interno.", detalhe: String(err) }, 500);
  }
});

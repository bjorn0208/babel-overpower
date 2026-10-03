/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * Memória evolutiva do DONO no canal interno (commandbar).
 *
 * Espelho simples do cano `memoria_lead`, mas sobre o usuário logado:
 *   - `extrairEGravarFatosDono`: roda FORA do caminho da resposta
 *     (fireAndForget pós-turno). LLM barata (Gemma — mesmo modelo do extrator
 *     do lead) lê o turno e devolve fatos duráveis sobre o usuário/empresa;
 *     grava em `memoria_dono` ignorando duplicata exata (UNIQUE owner+md5).
 *   - `recuperarMemoriaDono`: top-N fatos ativos por recência, formatados pra
 *     entrar no system prompt do turno seguinte.
 *
 * V1 sem vetor semântico — recall por recência é suficiente pro volume do
 * canal interno e mantém o cano desenhável num guardanapo.
 */

// deno-lint-ignore no-explicit-any
type AnyClient = any;

const MODELO_EXTRATOR_DONO = "google/gemma-4-31b-it";
const MAX_FATOS_POR_TURNO = 5;
const MAX_FATOS_RECALL = 12;

const PROMPT_EXTRATOR =
  "Você extrai fatos DURÁVEIS sobre o usuário dono da conta a partir de um turno de conversa " +
  "com o assistente da empresa dele. Fato durável = algo que continua verdade nas próximas semanas " +
  "(negócio, metas, preferências de trabalho, contexto da empresa, decisões tomadas, pessoas da equipe). " +
  "NÃO extraia: pedidos pontuais ('me mostra X'), dados que já são do sistema (contagens, listas), " +
  "conteúdo da resposta do assistente, opinião do assistente. " +
  'Responda SÓ JSON: {"fatos":[{"fato":"...","categoria":"negocio|meta|preferencia|equipe|contexto"}]}. ' +
  'Sem fato durável → {"fatos":[]}.';

/** Bloco de texto com o que o assistente já sabe do dono (vazio se nada). */
export async function recuperarMemoriaDono(
  admin: AnyClient,
  ownerId: string,
  limite = MAX_FATOS_RECALL,
): Promise<string> {
  const { data } = await admin
    .from("memoria_dono")
    .select("fato, categoria")
    .eq("owner_id", ownerId)
    .eq("ativa", true)
    .order("atualizado_em", { ascending: false })
    .limit(limite);
  const fatos = Array.isArray(data) ? data : [];
  if (fatos.length === 0) return "";
  return [
    "O que você já sabe sobre este usuário (memória de conversas anteriores — use pra personalizar, não repita de volta):",
    // deno-lint-ignore no-explicit-any
    ...fatos.map((f: any) => `- [${f.categoria}] ${f.fato}`),
  ].join("\n");
}

/**
 * Extrai fatos do turno e grava. Desenhada pra fireAndForget: engole erro
 * (loga warning) e nunca afeta a resposta do usuário.
 */
export async function extrairEGravarFatosDono(
  admin: AnyClient,
  chamarLlm: (params: {
    modelo: string;
    // deno-lint-ignore no-explicit-any
    mensagens: any[];
    // deno-lint-ignore no-explicit-any
    tools: any[];
    max_iter: number;
    executarTool: (nome: string, args: Record<string, unknown>) => Promise<string>;
  }) => Promise<{ texto_final: string }>,
  params: {
    ownerId: string;
    conversaId: string;
    mensagemUser: string;
    respostaMentor: string;
  },
): Promise<void> {
  try {
    const turno =
      `USUÁRIO: ${params.mensagemUser.slice(0, 2000)}\n` +
      `ASSISTENTE: ${params.respostaMentor.slice(0, 2000)}`;

    const r = await chamarLlm({
      modelo: MODELO_EXTRATOR_DONO,
      mensagens: [
        { role: "system", content: PROMPT_EXTRATOR },
        { role: "user", content: turno },
      ],
      tools: [],
      max_iter: 1,
      executarTool: () => Promise.resolve(""),
    });

    const texto = String(r?.texto_final ?? "");
    const m = texto.match(/\{[\s\S]*\}/);
    if (!m) return;
    // deno-lint-ignore no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return;
    }
    const fatos = Array.isArray(parsed?.fatos) ? parsed.fatos.slice(0, MAX_FATOS_POR_TURNO) : [];
    if (fatos.length === 0) return;

    const linhas = fatos
      // deno-lint-ignore no-explicit-any
      .map((f: any) => ({
        owner_id: params.ownerId,
        fato: String(f?.fato ?? "").trim().slice(0, 500),
        categoria: ["negocio", "meta", "preferencia", "equipe", "contexto"].includes(String(f?.categoria))
          ? String(f.categoria)
          : "geral",
        origem_conversa_id: params.conversaId,
      }))
      // deno-lint-ignore no-explicit-any
      .filter((l: any) => l.fato.length >= 8);
    if (linhas.length === 0) return;

    // Insert 1 a 1: duplicata exata (UNIQUE owner+md5(fato)) vira erro de
    // unique engolido — PostgREST não resolve onConflict de expression index.
    for (const linha of linhas) {
      const { error } = await admin.from("memoria_dono").insert(linha);
      if (error && !String(error.message ?? "").includes("duplicate")) {
        console.warn("[memoria-dono] insert falhou:", error.message);
      }
    }
  } catch (e) {
    console.warn("[memoria-dono] extração falhou:", (e as Error).message);
  }
}

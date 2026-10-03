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

/**
 * Bloco de texto com o que o assistente já sabe do dono (vazio se nada).
 *
 * Bloco 5b (2026-09-16): com `pergunta`, o recall é por PARECENÇA (RPC
 * `buscar_memoria_dono`, cosseno no vetor) curado por saliência — a mesma
 * `curarFatosPorSaliencia` do lead (importância × reforço × esquecimento), e
 * evocar reforça (`evocar_memoria_dono`, fora do caminho da resposta). Sem
 * embedding, sem vetor gravado ou em falha, cai no top-N por recência de antes.
 */
export async function recuperarMemoriaDono(
  admin: AnyClient,
  ownerId: string,
  pergunta?: string,
  limite = MAX_FATOS_RECALL,
): Promise<string> {
  // deno-lint-ignore no-explicit-any
  let fatos: any[] = [];
  let modo = "recencia";
  if (pergunta?.trim()) {
    try {
      const { gerarEmbeddingQuery } = await import("./tools-internas.ts");
      const emb = await gerarEmbeddingQuery(admin, pergunta);
      if (emb) {
        const { data } = await admin.rpc("buscar_memoria_dono", {
          p_owner_id: ownerId, p_query_embedding: emb, p_match_count: 30,
        });
        const candidatos = Array.isArray(data) ? data : [];
        if (candidatos.length > 0) {
          const { curarFatosPorSaliencia } = await import("./recall-memoria.ts");
          fatos = curarFatosPorSaliencia(candidatos).slice(0, limite);
          modo = "saliencia";
          // deno-lint-ignore no-explicit-any
          const ids = fatos.map((f: any) => f.id).filter(Boolean);
          if (ids.length > 0) {
            const { fireAndForget } = await import("./fire-and-forget.ts");
            fireAndForget(
              Promise.resolve(admin.rpc("evocar_memoria_dono", { p_ids: ids })),
              "memoria-dono-evocar",
              { silent: true },
            );
          }
        }
      }
    } catch (e) {
      console.warn("[memoria-dono] recall por saliência falhou, caindo em recência:", (e as Error).message);
    }
  }
  if (fatos.length === 0) {
    const { data } = await admin
      .from("memoria_dono")
      .select("fato, categoria")
      .eq("owner_id", ownerId)
      .eq("ativa", true)
      .order("atualizado_em", { ascending: false })
      .limit(limite);
    fatos = Array.isArray(data) ? data : [];
  }
  if (fatos.length === 0) return "";
  console.log(`[memoria-dono] ${fatos.length} fato(s) por ${modo}`);
  return [
    "O que você já sabe sobre este usuário (memória de conversas anteriores — use pra personalizar e cite quando mudar a resposta, não repita de volta):",
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

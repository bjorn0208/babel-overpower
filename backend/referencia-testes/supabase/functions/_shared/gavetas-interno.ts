/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * Gavetas de RAG do canal interno (plano de 14/08, ligado em 16/09/2026 — bloco 1).
 *
 * O motor do lead recupera 11 gavetas por turno antes de falar; o canal interno
 * recuperava zero — o Mentor governava o agente sem ler nada do que governa.
 * Aqui entram as duas que servem ao DONO: `procedurais` (o roteiro curado do que
 * fazer, 74 blocos) e `conhecimento` (os fatos do negócio dele, 1.632 blocos).
 *
 * As outras nove gavetas do motor externo são de tom e persuasão — servem pra
 * convencer lead, não pra responder dono. Ficam de fora de propósito.
 *
 * Config vive em `config_chamadas_llm.gavetas_ativas` da chave `canal_mentor`
 * (a mesma que o canal já lê pro modelo): mudar piso/top_n é UPDATE, sem deploy.
 * Tudo aqui degrada gracioso: qualquer falha devolve "" e o turno segue como antes.
 */

// deno-lint-ignore no-explicit-any
type AnyClient = any;
// deno-lint-ignore no-explicit-any
type Bloco = Record<string, any>;

type CfgGaveta = { ativo?: boolean; piso?: number; top_n?: number };

/** Corta texto longo preservando o começo — bloco gigante não pode dominar o prompt. */
function cortar(txt: unknown, max: number): string {
  const s = String(txt ?? "").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Monta o XML do system prompt. Exportada pra ser testável sem rede. */
export function formatarGavetas(
  dados: { procedurais: Bloco[]; conhecimento: Bloco[] },
): string {
  const partes: string[] = [];

  if (dados.procedurais.length > 0) {
    const linhas = dados.procedurais.map((b) =>
      `- ${cortar(b.titulo ?? b.nome_procedimento ?? b.title, 120)}: ${cortar(b.passos ?? b.content ?? b.conteudo, 700)}`
    );
    partes.push(
      "<procedimentos_da_casa>\n" +
        "Roteiros curados pra esta situação. Siga os passos e vá contando o que está fazendo.\n" +
        linhas.join("\n") +
        "\n</procedimentos_da_casa>",
    );
  }

  if (dados.conhecimento.length > 0) {
    const linhas = dados.conhecimento.map((b) =>
      `- ${cortar(b.title ?? b.titulo, 120)}: ${cortar(b.content ?? b.conteudo, 700)}`
    );
    partes.push(
      "<conhecimento_da_empresa>\n" +
        "Fatos da base do dono. Use como fonte — não complete de memória o que não estiver aqui.\n" +
        linhas.join("\n") +
        "\n</conhecimento_da_empresa>",
    );
  }

  return partes.join("\n\n");
}

/**
 * Recupera as gavetas pra pergunta do turno. Nunca lança: erro vira "" e o
 * chamador segue com o prompt de sempre.
 */
export async function recuperarGavetasInterno(
  admin: AnyClient,
  params: { pergunta: string; tenantId: string; nichoId?: string | null },
): Promise<string> {
  if (!params.pergunta?.trim()) return "";
  try {
    const { getConfigChamada } = await import("./config-chamadas.ts");
    const cfg = await getConfigChamada(admin, "canal_mentor", params.tenantId, params.nichoId ?? null);
    const gavetas =
      (cfg as unknown as { chave?: string; gavetas_ativas?: Record<string, CfgGaveta> }).gavetas_ativas ?? {};
    const cfgPR = gavetas.procedurais;
    const cfgCO = gavetas.conhecimento;
    if (!cfgPR?.ativo && !cfgCO?.ativo) return "";

    const { gerarEmbeddingQuery } = await import("./tools-internas.ts");
    const emb = await gerarEmbeddingQuery(admin, params.pergunta);
    if (!emb) return "";

    // O conhecimento é indexado por agente, não por tenant. Cada tenant tem 1 agente
    // (26/26 em 14/08); se tiver mais de um, o mais antigo é o principal.
    let agenteId: string | null = null;
    if (cfgCO?.ativo) {
      const { data } = await admin
        .from("agentes_usuario")
        .select("id")
        .eq("user_id", params.tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      agenteId = (data?.id as string | undefined) ?? null;
    }

    const [resPR, resCO] = await Promise.allSettled([
      cfgPR?.ativo
        ? admin.rpc("busca_hibrida_procedurais", {
          p_query_text: params.pergunta,
          p_query_embedding: emb,
          p_tenant_id: params.tenantId,
          p_nicho_id: params.nichoId ?? null,
          p_top_k: cfgPR.top_n ?? 3,
          p_threshold: cfgPR.piso ?? 0.35,
        })
        : Promise.resolve({ data: [] }),
      cfgCO?.ativo && agenteId
        ? admin.rpc("busca_hibrida_conhecimento", {
          p_query_text: params.pergunta,
          p_query_embedding: emb,
          p_agent_id: agenteId,
          p_nicho_id: params.nichoId ?? null,
          p_tipo: null,
          p_category: null,
          p_match_count: cfgCO.top_n ?? 4,
        })
        : Promise.resolve({ data: [] }),
    ]);

    // deno-lint-ignore no-explicit-any
    const pega = (r: PromiseSettledResult<any>): Bloco[] =>
      r.status === "fulfilled" ? ((r.value?.data ?? []) as Bloco[]) : [];

    // `busca_hibrida_conhecimento` não tem piso próprio e o rrf_score dela vai só
    // até ~0,04 (nota da onda 2 de 23/05) — filtrar por piso aqui zeraria tudo.
    // O corte é o `top_n`; o `piso` da config fica reservado pra quando a RPC ganhar um.
    const conhecimento = pega(resCO);

    const texto = formatarGavetas({ procedurais: pega(resPR), conhecimento });
    if (texto) {
      console.log(
        `[gavetas-interno] ${pega(resPR).length} procedimento(s) + ${conhecimento.length} bloco(s) de conhecimento`,
      );
    }
    return texto;
  } catch (e) {
    console.warn("[gavetas-interno] recuperação falhou:", (e as Error).message);
    return "";
  }
}

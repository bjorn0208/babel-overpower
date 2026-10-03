// _shared/recall-memoria.ts
// Substrato de recall de memória — extraído do motor `ragentic-processar-inline`
// na Fusão C1 / Fase 1 (refactor puro: comportamento idêntico ao bloco inline
// original). É a "tomada" `_shared/` onde DEC-036 (fila por evento + guard) e
// as ondas do ragentic-lab (memória MemGPT, afetivo, BDI, ganchos) vão plugar
// sem reabrir o motor.
//
// Nota: a dependência `gerarEmbeddingQuery` (de `./tools-internas.ts`, que puxa
// libs Deno) é carregada via import DINÂMICO lazy só quando `deps` não é
// injetado. Isso mantém o módulo testável com tsx/node (o teste injeta `deps`
// e o import dinâmico nunca é tocado) sem mudar o comportamento em produção
// (Deno resolve o import dinâmico normalmente).

// O motor usa o client supabase com cast `any` (`const sb = supabase as any`).
// deno-lint-ignore no-explicit-any
type AnyClient = any;

export type RecallMemoria = {
  // deno-lint-ignore no-explicit-any
  fatosLead: any[];
  // deno-lint-ignore no-explicit-any
  episodios: any[];
};

// Injeção de dependência opcional (testabilidade isolada sem framework de mock).
// Em produção fica o default = o import real → comportamento idêntico ao inline.
export type RecallDeps = {
  gerarEmbeddingQuery: (
    supabase: AnyClient,
    texto: string,
  ) => Promise<number[] | null | undefined>;
};

// ── A5.2 (Trilha A · memória viva): saliência dinâmica + piso + budget por ITEM ──
// A importância de um fato EMERGE no turno: associação ao assunto (RRF — já no `score` da RPC v2)
// × força temporal (reforço hebbiano − esquecimento de Ebbinghaus) × modulação (carga emocional +
// prior de relevância). Os pesos ficam AQUI (TS), ajustáveis sem migration.
// Plano: docs/planejamento/2026-06-02-trilha-a-memoria-viva.md
const SAL_BUDGET_FATOS = 12; // limite por ITEM no prompt (decisão do Theus: por item, não token)
const SAL_PISO_ALTA = 3;     // fatos de alta relevância garantidos no recall (piso inegociável)
const SAL_K_REFORCO = 0.12;  // peso do reforço por nº de evocações (satura via ln → sem "rico fica mais rico")
const SAL_DECAY_DIA = 0.015; // esquecimento por dia sem evocar (Ebbinghaus)
const SAL_PESO_EMOCAO = 0.3; // quanto a carga emocional amplifica
const SAL_EXPOENTE = 0.7;    // o quanto a saliência puxa o score final

/**
 * Cura os candidatos do recall (v2) por saliência viva e corta no budget por item,
 * garantindo um piso de fatos de alta relevância. Não toca o banco — só ordena/seleciona.
 */
// deno-lint-ignore no-explicit-any
export function curarFatosPorSaliencia(candidatos: any[]): any[] {
  if (!candidatos || candidatos.length === 0) return [];
  const agora = Date.now();
  const priorRelev = (r: string) => (r === "alta" ? 1.2 : r === "baixa" ? 0.8 : 1.0);
  const comScore = candidatos
    // deno-lint-ignore no-explicit-any
    .map((f: any) => {
      const baseTempo = f?.ultima_evocacao_em ?? f?.criado_em ?? null;
      const diasSemEvocar = baseTempo
        ? Math.max(0, (agora - new Date(baseTempo).getTime()) / 86_400_000)
        : 0;
      const forcaTemporal = (0.5 + SAL_K_REFORCO * Math.log(1 + (Number(f?.vezes_evocado) || 0))) *
        Math.exp(-SAL_DECAY_DIA * diasSemEvocar);
      const modulacao = (1 + (Number(f?.valencia_emocional) || 0) * SAL_PESO_EMOCAO) *
        priorRelev(String(f?.relevancia ?? "media"));
      const saliencia = Math.max(0.0001, forcaTemporal * modulacao);
      const scoreFinal = Number(f?.score || 0) * Math.pow(saliencia, SAL_EXPOENTE);
      return { ...f, _saliencia: saliencia, _score_final: scoreFinal };
    })
    .sort((a, b) => b._score_final - a._score_final);

  // Piso: até SAL_PISO_ALTA fatos garantidos (maior score_final) — relevância 'alta' OU
  // confirmado_pelo_lead (verdade dita de boca própria pelo lead nunca corta no recall).
  const piso = comScore
    .filter((f) => String(f?.relevancia ?? "") === "alta" || f?.confirmado_pelo_lead === true)
    .slice(0, SAL_PISO_ALTA);
  const pisoIds = new Set(piso.map((f) => f.id));
  const flutuantes = comScore
    .filter((f) => !pisoIds.has(f.id))
    .slice(0, Math.max(0, SAL_BUDGET_FATOS - piso.length));
  return [...piso, ...flutuantes];
}

/**
 * Recupera fatos (`busca_hibrida_memoria_lead`) + episódios
 * (`busca_hibrida_memoria_episodica`) por recall híbrido, usando o embedding
 * da query do turno. **Idêntico ao bloco inline original** do motor: mesmas
 * RPCs, mesmos parâmetros (`p_match_count` 10/5), mesmo fallback silencioso
 * (catch → console.warn, retorna listas vazias). Sem `leadId` → vazio.
 */
export async function recuperarMemoriaLead(
  supabase: AnyClient,
  params: { leadId: string | null | undefined; tenantId: string; queryRecall: string },
  deps?: RecallDeps,
): Promise<RecallMemoria> {
  // deno-lint-ignore no-explicit-any
  let fatosLead: any[] = [];
  // deno-lint-ignore no-explicit-any
  let episodios: any[] = [];
  if (params.leadId) {
    try {
      const sb = supabase as AnyClient;
      const gerarEmbeddingQuery = deps?.gerarEmbeddingQuery ??
        (await import("./tools-internas.ts")).gerarEmbeddingQuery;
      const embeddingMem = await gerarEmbeddingQuery(supabase, params.queryRecall);
      if (embeddingMem) {
        const [fatosResp, episResp] = await Promise.all([
          sb.rpc("busca_hibrida_memoria_lead_v2", {
            p_lead_id: params.leadId,
            p_query_text: params.queryRecall,
            p_query_embedding: embeddingMem,
            p_match_count: 30,
            // Tenant explícito: o motor roda como service_role → auth.uid() é NULL, zerava os fatos (Onda 2.5).
            p_tenant_id: params.tenantId,
          }),
          sb.rpc("busca_hibrida_memoria_episodica", {
            p_tenant_id: params.tenantId,
            p_query_text: params.queryRecall,
            p_query_embedding: embeddingMem,
            p_lead_id: params.leadId,
            p_match_count: 5,
          }),
        ]);
        // A5.2: cura por saliência viva + piso + budget por item (substitui o slice cego anterior).
        // deno-lint-ignore no-explicit-any
        fatosLead = curarFatosPorSaliencia((fatosResp.data as any[]) ?? []);
        // deno-lint-ignore no-explicit-any
        episodios = ((episResp.data as any[]) ?? []);
        // Onda 3A — reconsolidação: evocar um episódio o fortalece (boost relevância+decay e
        // reseta o relógio do decay). try/catch próprio: falha aqui não derruba o recall.
        if (episodios.length > 0) {
          try {
            await sb.rpc("reconsolidar_episodios", {
              p_ids: episodios.map((e: { id: string }) => e.id),
            });
          } catch (er) {
            console.warn("[reconsolidacao]", (er as Error).message);
          }
        }
        // A5.2: evocar um fato escolhido o fortalece (reforço hebbiano em `memoria_lead`),
        // fora da latência crítica da resposta — espelha o que já fazemos com episódios.
        if (fatosLead.length > 0) {
          try {
            await sb.rpc("reconsolidar_fatos", {
              p_ids: fatosLead.map((f: { id: string }) => f.id),
            });
          } catch (er) {
            console.warn("[reconsolidacao-fatos]", (er as Error).message);
          }
        }
      }
    } catch (e) {
      console.warn("[onda-1 recall memoria]", (e as Error).message);
    }
  }
  return { fatosLead, episodios };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolverEntidadePorNome — Fusão C1 / Fase 3a (2026-05-18)
//
// Base do "como tá a negociação com o André Marques?" no canal interno (dono
// pergunta pelo nome → resolve o lead → recall). Raio-x Supabase MCP (5088
// leads vivos): `leads.name` 97% preenchido, `leads.nome_exibicao` 79%,
// `dados_ficha->>'nome'` 1,5%. Decisão: buscar por `name` + `nome_exibicao`
// (ilike), sempre com `tenant_id` + `deleted_at IS NULL`. SEM migration
// (colunas já existem e populadas). Trata 0/1/N (homônimo → status "ambiguo"
// com a lista, pro Mentor pedir desambiguação). Fail-safe: termo curto/erro →
// "nenhum" (nunca quebra o canal interno). `leads.name` é coluna inglês —
// débito de vocabulário §7.3, usada como está (usar coluna existente ≠ criar
// nome novo); não renomear nesta fase.
// ─────────────────────────────────────────────────────────────────────────────

export type EntidadeLead = {
  id: string;
  name: string | null;
  nome_exibicao: string | null;
  phone: string | null;
};

export type ResolucaoEntidade = {
  status: "nenhum" | "unico" | "ambiguo";
  entidades: EntidadeLead[];
};

export async function resolverEntidadePorNome(
  supabase: AnyClient,
  params: { tenantId: string; termo: string; limite?: number },
): Promise<ResolucaoEntidade> {
  const termo = (params.termo ?? "").trim();
  // Guard: termo < 2 chars evitaria `%%` (traria a base inteira).
  if (termo.length < 2 || !params.tenantId) {
    return { status: "nenhum", entidades: [] };
  }
  try {
    const sb = supabase as AnyClient;
    const padrao = `%${termo}%`;
    const { data } = await sb
      .from("leads")
      .select("id, name, nome_exibicao, phone")
      .eq("tenant_id", params.tenantId)
      .is("deleted_at", null)
      .or(`name.ilike.${padrao},nome_exibicao.ilike.${padrao}`)
      .limit(params.limite ?? 8);
    // deno-lint-ignore no-explicit-any
    const ents: EntidadeLead[] = (((data as any[]) ?? []) as EntidadeLead[]);
    if (ents.length === 0) return { status: "nenhum", entidades: [] };
    if (ents.length === 1) return { status: "unico", entidades: ents };
    return { status: "ambiguo", entidades: ents };
  } catch (e) {
    console.warn("[fase3a resolverEntidadePorNome]", (e as Error).message);
    return { status: "nenhum", entidades: [] };
  }
}

/**
 * C1-fase-2 — Helper de leitura de `config_chamadas_llm` com cache em memória.
 *
 * Usa RPC `obter_config_chamada_llm` (cascata tenant→nicho→global) — não SELECT direto.
 * Permite que o motor ragentic-processar-inline (e qualquer edge) leia config
 * viva de cada chamada LLM (porteiro, sintese, extrator, mentor) sem deploy.
 *
 * Cache TTL = 60s por (chave + tenant_id + nicho_id). Invalida automaticamente.
 * Falha-aberta: retorna DEFAULTS hardcoded se RPC falhar (não derruba o motor).
 *
 * Integração (Onda 7A):
 *   import { getConfigChamada } from "../_shared/config-chamadas.ts";
 *   const cfg = await getConfigChamada(supabaseAdmin, "porteiro", tenant_id, nicho_id);
 *   // usar cfg.modelo, cfg.temperatura, cfg.max_tokens, cfg.prompt_template, cfg.itens_produzidos
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type EscopoConfig = "global" | "nicho" | "tenant";
export type PosicaoConfig = "turno" | "cron";

export interface ConfigChamada {
  chave: string;
  nome: string;
  descricao: string | null;
  modelo: string;
  temperatura: number;
  max_tokens: number;
  prompt_template: string;
  itens_produzidos: string[];
  escopo: EscopoConfig;
  nicho_id: string | null;
  tenant_id: string | null;
  custo_teto_diario: number | null;
  notas: string | null;
  posicao: PosicaoConfig;
  schedule: string | null;
  json_mode: boolean;
  versao: number;
  ativo: boolean;
}

// Defaults hardcoded — fallback quando RPC falhar OU desligar via env.
// Modelos refletem o seed global REAL pós Onda 1 RAG-first (2026-05-29):
// porteiro/extrator/auditor/classificador = Gemma-4-31b-it; sintese = Gemini-3.1-flash-lite.
// Mentor/curadoria mantêm Gemini-3.1-pro-preview-customtools por causa de function calling.
const DEFAULTS: Record<string, ConfigChamada> = {
  porteiro: {
    chave: "porteiro",
    nome: "Porteiro",
    descricao: null,
    modelo: "google/gemma-4-31b-it",
    temperatura: 0.1,
    max_tokens: 512,
    prompt_template: "",
    itens_produzidos: [],
    escopo: "global",
    nicho_id: null,
    tenant_id: null,
    custo_teto_diario: null,
    notas: null,
    posicao: "turno",
    schedule: null,
    json_mode: true,
    versao: 1,
    ativo: true,
  },
  sintese: {
    chave: "sintese",
    nome: "Síntese",
    descricao: null,
    modelo: "google/gemini-3.1-flash-lite",
    temperatura: 0.4,
    max_tokens: 1500,
    prompt_template: "",
    itens_produzidos: [],
    escopo: "global",
    nicho_id: null,
    tenant_id: null,
    custo_teto_diario: null,
    notas: null,
    posicao: "turno",
    schedule: null,
    json_mode: true,
    versao: 1,
    ativo: true,
  },
  extrator: {
    chave: "extrator",
    nome: "Extrator",
    descricao: null,
    modelo: "google/gemma-4-31b-it",
    temperatura: 0.0,
    max_tokens: 256,
    prompt_template: "",
    itens_produzidos: [],
    escopo: "global",
    nicho_id: null,
    tenant_id: null,
    custo_teto_diario: null,
    notas: null,
    posicao: "turno",
    schedule: null,
    json_mode: true,
    versao: 1,
    ativo: true,
  },
  mentor: {
    chave: "mentor",
    nome: "Mentor",
    descricao: null,
    modelo: "google/gemini-3.1-pro-preview-customtools",
    temperatura: 0.4,
    max_tokens: 2048,
    prompt_template: "",
    itens_produzidos: [],
    escopo: "global",
    nicho_id: null,
    tenant_id: null,
    custo_teto_diario: null,
    notas: null,
    posicao: "turno",
    schedule: null,
    json_mode: false,
    versao: 1,
    ativo: true,
  },
  auditor_groundedness: {
    chave: "auditor_groundedness",
    nome: "Auditor Groundedness",
    descricao: null,
    modelo: "google/gemma-4-31b-it",
    temperatura: 0.0,
    max_tokens: 512,
    prompt_template: "",
    itens_produzidos: [],
    escopo: "global",
    nicho_id: null,
    tenant_id: null,
    custo_teto_diario: null,
    notas: null,
    posicao: "turno",
    schedule: null,
    json_mode: true,
    versao: 1,
    ativo: true,
  },
  classificador_relevancia_mentor: {
    chave: "classificador_relevancia_mentor",
    nome: "Classificador de Relevância (pré loop-mentor)",
    descricao: null,
    modelo: "google/gemma-4-31b-it",
    temperatura: 0.0,
    max_tokens: 256,
    prompt_template: "",
    itens_produzidos: [],
    escopo: "global",
    nicho_id: null,
    tenant_id: null,
    custo_teto_diario: null,
    notas: null,
    posicao: "turno",
    schedule: null,
    json_mode: true,
    versao: 1,
    ativo: true,
  },
};

const CACHE_TTL_MS = 60_000;
type CacheKey = string;
const cache = new Map<CacheKey, { cfg: ConfigChamada; expira: number }>();

function makeKey(chave: string, tenant_id: string | null, nicho_id: string | null): CacheKey {
  return `${chave}|${tenant_id ?? ""}|${nicho_id ?? ""}`;
}

/**
 * Flag de runtime — permite desligar leitura via env e cair no fallback hardcoded.
 * Default ON (true). Pra desligar: USAR_CONFIG_CHAMADAS_LLM=false.
 */
function isAtivo(): boolean {
  try {
    // @ts-ignore Deno global
    const v = (typeof Deno !== "undefined" ? Deno.env.get("USAR_CONFIG_CHAMADAS_LLM") : "true") ?? "true";
    return v.toLowerCase() !== "false";
  } catch {
    return true;
  }
}

/**
 * Lookup via RPC cascata tenant→nicho→global. Cacheia 60s.
 *
 * @param chave 'porteiro' | 'sintese' | 'extrator' | 'mentor' (ou qualquer custom)
 * @param tenant_id opcional — se passado, tenta override por tenant primeiro
 * @param nicho_id opcional — se passado, tenta override por nicho como fallback
 */
export async function getConfigChamada(
  supabase: SupabaseClient,
  chave: string,
  tenant_id: string | null = null,
  nicho_id: string | null = null,
): Promise<ConfigChamada> {
  // Flag de desligamento (fallback total pros DEFAULTS hardcoded)
  if (!isAtivo()) {
    return DEFAULTS[chave] ?? DEFAULTS.sintese;
  }

  const key = makeKey(chave, tenant_id, nicho_id);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expira > now) {
    return cached.cfg;
  }

  try {
    // RPC cascata: tenant → nicho → global
    const { data, error } = await supabase.rpc("obter_config_chamada_llm", {
      p_chave: chave,
      p_tenant_id: tenant_id,
      p_nicho_id: nicho_id,
    });

    if (error || !data || !data.chave) {
      console.warn(`[config-chamadas] fallback default pra ${chave}:`, error?.message ?? "no row");
      return DEFAULTS[chave] ?? DEFAULTS.sintese;
    }

    const cfg: ConfigChamada = {
      chave: data.chave,
      nome: data.nome,
      descricao: data.descricao,
      modelo: data.modelo,
      temperatura: Number(data.temperatura),
      max_tokens: Number(data.max_tokens),
      prompt_template: data.prompt_template ?? "",
      itens_produzidos: data.itens_produzidos ?? [],
      escopo: (data.escopo ?? "global") as EscopoConfig,
      nicho_id: data.nicho_id,
      tenant_id: data.tenant_id,
      custo_teto_diario: data.custo_teto_diario,
      notas: data.notas,
      posicao: (data.posicao ?? "turno") as PosicaoConfig,
      schedule: data.schedule,
      json_mode: !!data.json_mode,
      versao: Number(data.versao),
      ativo: !!data.ativo,
    };

    cache.set(key, { cfg, expira: now + CACHE_TTL_MS });
    return cfg;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[config-chamadas] erro inesperado pra ${chave}:`, msg);
    return DEFAULTS[chave] ?? DEFAULTS.sintese;
  }
}

/**
 * Invalida cache de uma chave (chamar após UPDATE via Curadoria).
 * Por padrão TTL 60s cuida disso, mas em cenários "salvar agora e testar" útil.
 */
export function invalidarCacheConfig(chave: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${chave}|`)) cache.delete(key);
  }
}

export function limparTodoCache(): void {
  cache.clear();
}

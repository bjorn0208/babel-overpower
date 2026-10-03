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
  gavetas_ativas?: Record<string, { ativo: boolean; piso: number; top_n: number }>;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const DEFAULTS: Record<string, ConfigChamada> = {
  porteiro: {
    chave: "porteiro", nome: "Porteiro", descricao: null, modelo: "google/gemma-4-31b-it",
    temperatura: 0.1, max_tokens: 512, prompt_template: "", itens_produzidos: [], escopo: "global",
    nicho_id: null, tenant_id: null, custo_teto_diario: null, notas: null, posicao: "turno",
    schedule: null, json_mode: true, versao: 1, ativo: true,
  },
  sintese: {
    chave: "sintese", nome: "Síntese", descricao: null, modelo: "google/gemini-3.1-flash-lite",
    temperatura: 0.4, max_tokens: 1500, prompt_template: "", itens_produzidos: [], escopo: "global",
    nicho_id: null, tenant_id: null, custo_teto_diario: null, notas: null, posicao: "turno",
    schedule: null, json_mode: true, versao: 1, ativo: true,
  },
  extrator: {
    chave: "extrator", nome: "Extrator", descricao: null, modelo: "google/gemma-4-31b-it",
    temperatura: 0.0, max_tokens: 256, prompt_template: "", itens_produzidos: [], escopo: "global",
    nicho_id: null, tenant_id: null, custo_teto_diario: null, notas: null, posicao: "turno",
    schedule: null, json_mode: true, versao: 1, ativo: true,
  },
  mentor: {
    chave: "mentor", nome: "Mentor", descricao: null, modelo: "google/gemini-3.1-pro-preview-customtools",
    temperatura: 0.4, max_tokens: 2048, prompt_template: "", itens_produzidos: [], escopo: "global",
    nicho_id: null, tenant_id: null, custo_teto_diario: null, notas: null, posicao: "turno",
    schedule: null, json_mode: false, versao: 1, ativo: true,
  },
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { cfg: ConfigChamada; expira: number }>();

function makeKey(chave: string, tenant_id: string | null, nicho_id: string | null): string {
  return `${chave}|${tenant_id ?? ""}|${nicho_id ?? ""}`;
}

function isAtivo(): boolean {
  try {
    // @ts-ignore Deno global
    const v = (typeof Deno !== "undefined" ? Deno.env.get("USAR_CONFIG_CHAMADAS_LLM") : "true") ?? "true";
    return v.toLowerCase() !== "false";
  } catch {
    return true;
  }
}

export async function getConfigChamada(
  supabase: SupabaseClient,
  chave: string,
  tenant_id: string | null = null,
  nicho_id: string | null = null,
): Promise<ConfigChamada> {
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
      gavetas_ativas: data.gavetas_ativas ?? {},
    };

    cache.set(key, { cfg, expira: now + CACHE_TTL_MS });
    return cfg;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[config-chamadas] erro inesperado pra ${chave}:`, msg);
    return DEFAULTS[chave] ?? DEFAULTS.sintese;
  }
}

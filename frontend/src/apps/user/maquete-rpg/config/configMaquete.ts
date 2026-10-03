/**
 * configMaquete — store mutável (singleton em memória + localStorage) com
 * todas as preferências da maquete-RPG.
 *
 * Persistência: hoje localStorage por usuário. A migração pra Supabase
 * está documentada em `Docs/maquete-rpg/configuracao-supabase.md`.
 *
 * A `simulacao.ts` lê deste módulo via `getConfigRuntime()` (sem prop drill).
 * A UI altera via `salvarConfig()`, que dispara listeners (hook recarrega).
 */

import { ESTACOES } from "../canvas/MapaEmpresa";
import type { CargoTipologia } from "../dados/useConversasMaquete";

/** Spritesheets disponíveis pra escolher como personagem (funcionário/humano). */
export type SpriteKey =
  | "char0" | "char1" | "char2" | "char3" | "char4" | "char5"
  | "lead0" | "lead1" | "lead2" | "lead3" | "lead4" | "lead5" | "lead6"
  | "lead7" | "lead8" | "lead9" | "lead10" | "lead11" | "lead12" | "lead13";

export const SPRITES_DISPONIVEIS: SpriteKey[] = [
  "char0", "char1", "char2", "char3", "char4", "char5",
  "lead0", "lead1", "lead2", "lead3", "lead4", "lead5", "lead6", "lead7",
];

export const CARGOS: CargoTipologia[] = [
  "atendimento", "vendedor", "financeiro", "suporte", "mentor",
];

export const ROTULO_CARGO: Record<CargoTipologia, string> = {
  atendimento: "Atendimento",
  vendedor: "Vendedor",
  financeiro: "Financeiro",
  suporte: "Suporte",
  mentor: "Mentor",
};

const SPRITE_PADRAO_CARGO: Record<CargoTipologia, SpriteKey> = {
  atendimento: "char0",
  vendedor: "char1",
  financeiro: "char2",
  suporte: "char3",
  mentor: "char4",
};

export interface ConfigCargo {
  visivel: boolean;
  sprite: SpriteKey;
  /** estação primária (id em ESTACOES) — onde o funcionário senta. */
  estacaoId: string;
}

export interface ConfigHumano {
  /** id do profile (membro do app Equipe). */
  id: string;
  nome: string;
  cargo: CargoTipologia;
  estacaoId: string;
  sprite: SpriteKey;
  visivel: boolean;
}

export interface ConfigMaquete {
  /** minutos sem mensagem até o lead ir pra sala de espera. */
  tempoEsperaMin: number;
  /** minutos sem mensagem até o lead ir embora (sai pela porta). */
  tempoEmboraMin: number;
  cargos: Record<CargoTipologia, ConfigCargo>;
  humanos: ConfigHumano[];
}

/** Mapa estável estacaoId → número de exibição (1..N), na ordem de ESTACOES[]. */
export const NUMERO_ESTACAO: Record<string, number> = Object.fromEntries(
  ESTACOES.map((e, i) => [e.id, i + 1]),
);

function defaults(): ConfigMaquete {
  const cargos = {} as Record<CargoTipologia, ConfigCargo>;
  for (const c of CARGOS) {
    const primaria = ESTACOES.find((e) => e.cargo === c);
    cargos[c] = {
      visivel: true,
      sprite: SPRITE_PADRAO_CARGO[c],
      estacaoId: primaria?.id ?? ESTACOES[0].id,
    };
  }
  return {
    tempoEsperaMin: 5,
    tempoEmboraMin: 30,
    cargos,
    humanos: [],
  };
}

// Chave de storage ESCOPADA por usuário. Sem o escopo, num mesmo device duas
// contas dividiam a mesma config — ids de profile (humanos), estações e sprites
// vazavam de um usuário pro outro. `escoparConfigPorUsuario` (chamado no boot com
// o uid) troca a chave e recarrega a config da conta certa.
const STORAGE_PREFIXO = "maquete-rpg:config:v1";
let usuarioId: string | null = null;

function chaveStorage(): string {
  return `${STORAGE_PREFIXO}:${usuarioId ?? "anon"}`;
}

function carregar(): ConfigMaquete {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(chaveStorage());
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<ConfigMaquete>;
    const base = defaults();
    return {
      ...base,
      ...parsed,
      cargos: { ...base.cargos, ...(parsed.cargos ?? {}) } as Record<CargoTipologia, ConfigCargo>,
      humanos: Array.isArray(parsed.humanos) ? parsed.humanos : [],
    };
  } catch {
    return defaults();
  }
}

let atual: ConfigMaquete = carregar();
const listeners = new Set<(c: ConfigMaquete) => void>();

export function getConfigRuntime(): ConfigMaquete {
  return atual;
}

export function salvarConfig(novo: ConfigMaquete) {
  atual = novo;
  try {
    window.localStorage.setItem(chaveStorage(), JSON.stringify(novo));
  } catch {
    /* quota / SSR */
  }
  for (const l of listeners) l(atual);
}

/**
 * Escopa o store por usuário. Chamado no boot da maquete (useConfigMaquete) com o
 * uid da sessão. Troca a chave de localStorage e recarrega a config da conta certa,
 * notificando os assinantes.
 */
export function escoparConfigPorUsuario(uid: string | null): void {
  if (usuarioId === uid) return;
  usuarioId = uid;
  atual = carregar();
  for (const l of listeners) l(atual);
}

export function inscrever(fn: (c: ConfigMaquete) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Tempos em ms (consumidos pela simulação). */
export function tempoEsperaMs(): number {
  return Math.max(10_000, atual.tempoEsperaMin * 60_000);
}
export function tempoEmboraMs(): number {
  return Math.max(30_000, atual.tempoEmboraMin * 60_000);
}

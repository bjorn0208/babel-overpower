/**
 * Catálogo canônico de papéis de parede do Ragentic OS.
 *
 * Fonte da verdade: era inline em bundle.jsx linhas 285-311.
 * Cravado em módulo dedicado 2026-05-13 (Fase 1B — auditoria OS).
 *
 * Cada preset define a aurora deep do desktop + acento primário/secundário
 * que se propagam pras CSS vars `--os-acento-1` e `--os-acento-2`.
 *
 * Cores em OKLCH (decisão do docs/design-system/00-tokens.md).
 */

/**
 * Preset de wallpaper do Ragentic OS.
 *
 * Pra criar um novo preset (ex: tenant white-label):
 *   1. Escolha 2 cores OKLCH do mesmo hue family (diferença de ~60° max no canal de tom)
 *   2. Use lightness 0.6-0.78 + chroma 0.14-0.22 nas acentos pra contraste consistente
 *   3. Construa o bg com 2 radial-gradient (~60-70% size) sobre um linear-gradient base dark
 *
 * Exemplo:
 * ```ts
 * {
 *   id: "violet-dusk",
 *   nome: "Violeta crepúsculo",
 *   acento1: "oklch(0.72 0.18 290)",
 *   acento2: "oklch(0.62 0.20 320)",
 *   bg: `radial-gradient(60% 80% at 25% 35%, oklch(0.40 0.18 290 / 0.65), transparent 60%),
 *        radial-gradient(70% 80% at 75% 65%, oklch(0.35 0.20 320 / 0.55), transparent 60%),
 *        linear-gradient(135deg, oklch(0.15 0.04 290), oklch(0.18 0.06 320))`,
 * }
 * ```
 *
 * Sempre OKLCH (nunca hex/rgb). Confira contraste WCAG do texto branco
 * sobre os pontos mais claros do gradient antes de aprovar.
 */
export interface WallpaperPreset {
  /** Identificador estável usado em persistência (preferencias_ui_usuario.papel_parede_id). */
  id: string;
  /** Nome amigável exibido na seleção em Aparência. */
  nome: string;
  /** Cor de acento primária do tema (CSS var --os-acento-1). OKLCH only. */
  acento1: string;
  /** Cor de acento secundária do tema (CSS var --os-acento-2). OKLCH only. */
  acento2: string;
  /** Background CSS aplicado em .wallpaper. Composição: 2 radial-gradient + 1 linear. */
  bg: string;
}

export const WALLPAPERS: readonly WallpaperPreset[] = [
  {
    id: "aurora",
    nome: "Aurora padrão",
    acento1: "oklch(0.7 0.18 220)",
    acento2: "oklch(0.65 0.22 280)",
    // Composição: 4 radial-gradients (4 cantos) + linear-gradient base.
    // Cantos opostos puxam lilás esfumaçado pra dar sensação de neblina viva.
    // Theus 2026-05-13: lilás mais presente + fumaça nos cantos.
    bg: `radial-gradient(55% 70% at 18% 28%, oklch(0.50 0.22 290 / 0.78), transparent 65%),
         radial-gradient(60% 75% at 82% 72%, oklch(0.42 0.20 235 / 0.62), transparent 65%),
         radial-gradient(45% 60% at 88% 18%, oklch(0.62 0.24 305 / 0.40), transparent 72%),
         radial-gradient(50% 65% at 12% 88%, oklch(0.55 0.22 300 / 0.42), transparent 72%),
         linear-gradient(135deg, oklch(0.15 0.04 264), oklch(0.18 0.06 285))`,
  },
  {
    id: "sunset",
    nome: "Pôr-do-sol",
    acento1: "oklch(0.78 0.18 50)",
    acento2: "oklch(0.68 0.22 0)",
    bg: `radial-gradient(60% 80% at 20% 80%, oklch(0.55 0.22 30 / 0.7), transparent 60%),
         radial-gradient(70% 80% at 80% 30%, oklch(0.45 0.18 340 / 0.6), transparent 60%),
         linear-gradient(135deg, oklch(0.18 0.06 30), oklch(0.20 0.08 350))`,
  },
  {
    id: "forest",
    nome: "Floresta",
    acento1: "oklch(0.72 0.18 160)",
    acento2: "oklch(0.65 0.16 200)",
    bg: `radial-gradient(60% 80% at 30% 30%, oklch(0.42 0.16 145 / 0.65), transparent 60%),
         radial-gradient(70% 80% at 80% 80%, oklch(0.38 0.14 180 / 0.55), transparent 60%),
         linear-gradient(135deg, oklch(0.14 0.04 160), oklch(0.16 0.06 180))`,
  },
  {
    id: "midnight",
    nome: "Meia-noite",
    acento1: "oklch(0.68 0.18 260)",
    acento2: "oklch(0.55 0.20 290)",
    bg: `radial-gradient(60% 80% at 50% 30%, oklch(0.28 0.10 264 / 0.7), transparent 60%),
         radial-gradient(70% 80% at 20% 80%, oklch(0.20 0.08 280 / 0.55), transparent 60%),
         linear-gradient(135deg, oklch(0.08 0.02 264), oklch(0.10 0.03 280))`,
  },
  {
    id: "rose",
    nome: "Rosé clínico",
    acento1: "oklch(0.72 0.18 350)",
    acento2: "oklch(0.68 0.18 20)",
    bg: `radial-gradient(60% 80% at 70% 30%, oklch(0.55 0.18 350 / 0.55), transparent 60%),
         radial-gradient(70% 80% at 30% 80%, oklch(0.50 0.14 20 / 0.5), transparent 60%),
         linear-gradient(135deg, oklch(0.18 0.06 350), oklch(0.20 0.06 10))`,
  },
  {
    id: "oceano",
    nome: "Oceano profundo",
    acento1: "oklch(0.72 0.16 230)",
    acento2: "oklch(0.68 0.14 200)",
    bg: `radial-gradient(60% 80% at 25% 30%, oklch(0.38 0.14 230 / 0.7), transparent 62%),
         radial-gradient(70% 80% at 78% 75%, oklch(0.32 0.12 210 / 0.6), transparent 62%),
         linear-gradient(135deg, oklch(0.12 0.04 235), oklch(0.16 0.05 210))`,
  },
  {
    id: "ambar",
    nome: "Âmbar real",
    acento1: "oklch(0.78 0.16 80)",
    acento2: "oklch(0.70 0.18 55)",
    bg: `radial-gradient(60% 80% at 30% 70%, oklch(0.48 0.14 75 / 0.6), transparent 62%),
         radial-gradient(65% 75% at 75% 25%, oklch(0.42 0.12 55 / 0.55), transparent 62%),
         linear-gradient(135deg, oklch(0.15 0.04 70), oklch(0.18 0.05 50))`,
  },
  {
    id: "uva",
    nome: "Uva",
    acento1: "oklch(0.68 0.22 310)",
    acento2: "oklch(0.60 0.20 340)",
    bg: `radial-gradient(60% 80% at 20% 35%, oklch(0.42 0.20 310 / 0.68), transparent 62%),
         radial-gradient(70% 80% at 80% 70%, oklch(0.36 0.18 335 / 0.58), transparent 62%),
         linear-gradient(135deg, oklch(0.14 0.05 310), oklch(0.17 0.06 335))`,
  },
  {
    id: "carmim",
    nome: "Carmim",
    acento1: "oklch(0.66 0.22 20)",
    acento2: "oklch(0.58 0.20 350)",
    bg: `radial-gradient(60% 80% at 70% 30%, oklch(0.42 0.20 20 / 0.62), transparent 62%),
         radial-gradient(65% 75% at 25% 75%, oklch(0.36 0.18 355 / 0.55), transparent 62%),
         linear-gradient(135deg, oklch(0.13 0.05 15), oklch(0.16 0.06 350))`,
  },
  {
    id: "esmeralda",
    nome: "Esmeralda",
    acento1: "oklch(0.74 0.18 150)",
    acento2: "oklch(0.66 0.16 175)",
    bg: `radial-gradient(60% 80% at 30% 25%, oklch(0.40 0.16 150 / 0.66), transparent 62%),
         radial-gradient(70% 80% at 75% 78%, oklch(0.34 0.14 175 / 0.56), transparent 62%),
         linear-gradient(135deg, oklch(0.12 0.04 150), oklch(0.15 0.05 175))`,
  },
  {
    id: "grafite",
    nome: "Grafite",
    acento1: "oklch(0.75 0.02 260)",
    acento2: "oklch(0.62 0.04 260)",
    bg: `radial-gradient(60% 80% at 30% 30%, oklch(0.30 0.01 260 / 0.7), transparent 62%),
         radial-gradient(70% 80% at 75% 75%, oklch(0.24 0.01 260 / 0.6), transparent 62%),
         linear-gradient(135deg, oklch(0.10 0.005 260), oklch(0.14 0.01 260))`,
  },
  {
    id: "ouro-negro",
    nome: "Ouro negro",
    acento1: "oklch(0.80 0.14 95)",
    acento2: "oklch(0.68 0.12 75)",
    bg: `radial-gradient(55% 75% at 25% 70%, oklch(0.36 0.10 95 / 0.55), transparent 62%),
         radial-gradient(65% 75% at 78% 28%, oklch(0.30 0.08 80 / 0.5), transparent 62%),
         linear-gradient(135deg, oklch(0.09 0.02 90), oklch(0.13 0.03 75))`,
  },
  {
    id: "gelo",
    nome: "Gelo polar",
    acento1: "oklch(0.80 0.10 210)",
    acento2: "oklch(0.72 0.08 250)",
    bg: `radial-gradient(60% 80% at 30% 25%, oklch(0.46 0.08 215 / 0.55), transparent 62%),
         radial-gradient(70% 80% at 75% 75%, oklch(0.40 0.06 245 / 0.5), transparent 62%),
         linear-gradient(135deg, oklch(0.16 0.02 220), oklch(0.20 0.03 245))`,
  },
  {
    id: "lavanda",
    nome: "Lavanda",
    acento1: "oklch(0.74 0.14 290)",
    acento2: "oklch(0.68 0.12 260)",
    bg: `radial-gradient(60% 80% at 22% 30%, oklch(0.46 0.12 290 / 0.6), transparent 62%),
         radial-gradient(70% 80% at 80% 72%, oklch(0.40 0.10 265 / 0.52), transparent 62%),
         linear-gradient(135deg, oklch(0.17 0.04 290), oklch(0.20 0.05 265))`,
  },
  {
    id: "brasa",
    nome: "Brasa",
    acento1: "oklch(0.72 0.20 40)",
    acento2: "oklch(0.62 0.22 25)",
    bg: `radial-gradient(60% 80% at 25% 75%, oklch(0.44 0.18 40 / 0.65), transparent 62%),
         radial-gradient(65% 75% at 78% 25%, oklch(0.38 0.16 25 / 0.55), transparent 62%),
         linear-gradient(135deg, oklch(0.12 0.04 40), oklch(0.15 0.05 25))`,
  },
] as const;

/** Default usado quando nenhuma preferência foi salva. */
export const WALLPAPER_DEFAULT_ID = "aurora";

/**
 * Resolve um id pra preset. Sempre retorna algo: se id inválido ou ausente,
 * cai no default. Nunca lança. Emite console.warn quando id válido (não vazio)
 * mas inexistente — ajuda admin/tenant a debugar id digitado errado no banco.
 */
export function resolverWallpaper(id?: string | null): WallpaperPreset {
  if (!id) return WALLPAPERS[0]!;
  const achado = WALLPAPERS.find((w) => w.id === id);
  if (!achado) {
    console.warn(
      `[wallpaper] id "${id}" não encontrado no catálogo · usando default "${WALLPAPER_DEFAULT_ID}". Ids válidos: ${WALLPAPERS.map((w) => w.id).join(", ")}.`,
    );
    return WALLPAPERS[0]!;
  }
  return achado;
}

/**
 * Aplica um preset diretamente no DOM:
 *  - .wallpaper recebe o background
 *  - :root recebe --os-acento-1, --os-acento-2 + soft variants
 *
 * Retorna o preset efetivamente aplicado (útil pra confirmação).
 *
 * Este helper preserva compatibilidade com o bundle.jsx que chama
 * `window.aplicarPapelParede(id)`. A função é exportada também via
 * `index.ts` e injetada em window por Wallpaper.tsx no mount.
 */
export function aplicarPapelParedeNoDom(id: string): WallpaperPreset {
  const w = resolverWallpaper(id);
  const el = document.querySelector<HTMLDivElement>(".wallpaper");
  if (el) el.style.background = w.bg;

  const root = document.documentElement;
  root.style.setProperty("--os-acento-1", w.acento1);
  root.style.setProperty("--os-acento-2", w.acento2);

  // soft variants — adicionar /0.18 antes do parêntese final
  const soft = (c: string): string => c.replace(")", " / 0.18)");
  root.style.setProperty("--os-acento-1-soft", soft(w.acento1));
  root.style.setProperty("--os-acento-2-soft", soft(w.acento2));

  return w;
}

declare global {
  interface Window {
    RAGENTIC_WALLPAPERS?: readonly WallpaperPreset[];
    aplicarPapelParede?: (id: string) => WallpaperPreset;
  }
}

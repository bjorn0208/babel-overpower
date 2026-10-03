/**
 * Declarações globais de tipos compartilhadas pelos módulos `src/os/*`.
 *
 * Estes globals são injetados pelo `src/bundle/bundle.jsx` legado.
 * Quando o bundle for totalmente quebrado, este arquivo pode encolher.
 */

import type { WallpaperPreset } from "@/os/wallpaper";

interface RagenticData {
  LEADS?: Array<{
    id: string;
    nome: string;
    phone: string;
    avatar: string;
    cor: string;
    hot?: boolean;
  }>;
  PEDIDOS?: unknown[];
  TENANTS?: Array<{ status?: string }>;
}

declare global {
  interface Window {
    /** Catálogo de wallpapers injetado por src/os/wallpaper/Wallpaper.tsx */
    RAGENTIC_WALLPAPERS?: readonly WallpaperPreset[];
    /** Helper pra trocar de wallpaper imperativamente */
    aplicarPapelParede?: (id: string) => WallpaperPreset;
    /** Mock data injetado pelo bundle.jsx legado (data.jsx) */
    RAGENTIC_DATA?: RagenticData;
    /** Componente Icon definido no bundle.jsx (icons.jsx) */
    Icon?: React.ComponentType<{
      name: string;
      size?: number;
      stroke?: string;
    }>;
  }
}

export {};

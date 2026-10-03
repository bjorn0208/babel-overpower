/**
 * Maquete-RPG — App raiz.
 *
 * Fase 3.2: clique em boneco abre a conversa correspondente em janela
 * ISOLADA (`conversa-isolada__<slug>`). Fase 4: botão de configuração
 * abre `PainelConfig` para ajustar tempos, cargos, sprites, estações
 * e funcionários humanos da Equipe.
 *
 * Doc: Docs/maquete-rpg/00-visao-geral.md
 * Persistência da config: Docs/maquete-rpg/configuracao-supabase.md
 */
import { lazy, Suspense, useCallback, useState } from "react";
import { Settings } from "lucide-react";
import { PalcoMaquete } from "./canvas/PalcoMaquete";
import { PainelConfig } from "./config/PainelConfig";

// Modo 3D/VR (WebXR) — lazy pra não pesar o bundle 2D com o three.js.
const Maquete3D = lazy(() => import("./tresD/Maquete3D"));

export interface MaqueteRpgProps {
  /** Repassado pelo OS (bundle.jsx) — abre um app pelo slug. */
  onAbrirApp?: (slug: string) => void;
}

export function MaqueteRpg({ onAbrirApp }: MaqueteRpgProps = {}) {
  const [configAberta, setConfigAberta] = useState(false);
  const [modo3D, setModo3D] = useState(false);

  const onAbrirConversa = useCallback(
    (conversaId: string) => {
      const slug = `conversa-isolada__${conversaId.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;
      try {
        const w = window as unknown as {
          __PAYLOADS_CONVERSAS?: Record<string, { id: string }>;
        };
        if (!w.__PAYLOADS_CONVERSAS) w.__PAYLOADS_CONVERSAS = {};
        w.__PAYLOADS_CONVERSAS[slug] = { id: conversaId };
      } catch {
        /* noop */
      }
      onAbrirApp?.(slug);
    },
    [onAbrirApp],
  );

  if (modo3D) {
    return (
      <Suspense fallback={<div className="grid h-full w-full place-items-center bg-zinc-950 text-sm text-zinc-400">Montando a maquete 3D…</div>}>
        <Maquete3D onSair={() => setModo3D(false)} />
      </Suspense>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950 text-zinc-100">
      <PalcoMaquete onAbrirConversa={onAbrirConversa} />

      {/* Modo 3D/VR — canto superior direito, ao lado da engrenagem */}
      <button
        type="button"
        onClick={() => setModo3D(true)}
        className="absolute right-12 top-3 z-10 flex items-center justify-center rounded-lg border border-indigo-500/50 bg-indigo-600/70 px-2 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-indigo-500"
        title="Entrar na maquete em 3D (e VR no Meta Quest)"
        aria-label="Abrir maquete 3D"
      >
        🥽 3D
      </button>

      {/* Botão de configuração — canto superior direito */}
      <button
        type="button"
        onClick={() => setConfigAberta(true)}
        className="absolute right-3 top-3 z-10 flex items-center justify-center rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-1.5 text-zinc-200 backdrop-blur hover:bg-zinc-800"
        title="Configuração da maquete"
        aria-label="Configuração da maquete"
      >
        <Settings className="h-4 w-4" />
      </button>

      <PainelConfig aberto={configAberta} onFechar={() => setConfigAberta(false)} />
    </div>
  );
}

export default MaqueteRpg;

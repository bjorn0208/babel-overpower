// Barra de replay — seletor de conversa + controles + banner de erro
// Extraído de MapaMotor.tsx para manter ≤300 linhas

import SeletorConversa from "./SeletorConversa";
import ControlesPlay from "./ControlesPlay";
import type { EstadoReplay } from "./tipos-replay";
import type { Velocidade } from "./use-play-replay";

interface PropsBarraReplay {
  replay: EstadoReplay;
  velocidades: readonly number[];
  onCarregar: (id: string) => void;
  onPlay: () => void;
  onPausar: () => void;
  onPasso: () => void;
  onRetroceder: () => void;
  onReiniciar: () => void;
  onMudarVelocidade: (v: Velocidade) => void;
}

export default function BarraReplay({
  replay,
  velocidades,
  onCarregar,
  onPlay,
  onPausar,
  onPasso,
  onRetroceder,
  onReiniciar,
  onMudarVelocidade,
}: PropsBarraReplay) {
  return (
    <>
      <SeletorConversa
        conversaAtual={replay.conversaId}
        carregando={replay.carregando}
        aoSelecionar={onCarregar}
      />
      <ControlesPlay
        estado={replay.estado}
        indiceAtual={replay.indiceAtual}
        totalPassos={replay.passos.length}
        velocidade={replay.velocidade}
        velocidades={velocidades}
        onPlay={onPlay}
        onPausar={onPausar}
        onPasso={onPasso}
        onRetroceder={onRetroceder}
        onReiniciar={onReiniciar}
        onMudarVelocidade={onMudarVelocidade}
      />
      {replay.erro && (
        <div
          style={{
            padding: "6px 16px",
            background: "oklch(0.28 0.10 30)",
            borderBottom: "1px solid oklch(0.38 0.12 30)",
            fontSize: 11,
            color: "oklch(0.85 0.10 30)",
            flexShrink: 0,
          }}
        >
          {replay.erro}
        </div>
      )}
    </>
  );
}

// Controles de reprodução do replay: Play/Pause/Passo + velocidade
// Design: barra compacta abaixo do seletor de conversa

import type { EstadoPlay } from "./tipos-replay";
import type { Velocidade } from "./use-play-replay";

interface PropsControlesPlay {
  estado: EstadoPlay;
  indiceAtual: number;
  totalPassos: number;
  velocidade: number;
  velocidades: readonly number[];
  onPlay: () => void;
  onPausar: () => void;
  onPasso: () => void;
  onRetroceder: () => void;
  onReiniciar: () => void;
  onMudarVelocidade: (v: Velocidade) => void;
}

const LABEL_VELOCIDADE: Record<number, string> = {
  0.5: "0.5×",
  1: "1×",
  2: "2×",
  99: "⚡",
};

function BotaoIcone({
  onClick,
  disabled,
  title,
  children,
  destaque,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        background: destaque
          ? "oklch(0.55 0.18 145)"
          : "oklch(0.18 0.02 240)",
        border: `1.5px solid ${destaque ? "oklch(0.55 0.18 145)" : "oklch(0.28 0.03 240)"}`,
        borderRadius: 6,
        color: disabled
          ? "oklch(0.38 0.02 240)"
          : destaque
          ? "oklch(0.97 0.01 240)"
          : "oklch(0.78 0.04 240)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 14,
        lineHeight: 1,
        padding: "5px 10px",
        transition: "background 120ms ease-out, border-color 120ms ease-out",
        minWidth: 32,
      }}
    >
      {children}
    </button>
  );
}

export default function ControlesPlay({
  estado,
  indiceAtual,
  totalPassos,
  velocidade,
  velocidades,
  onPlay,
  onPausar,
  onPasso,
  onRetroceder,
  onReiniciar,
  onMudarVelocidade,
}: PropsControlesPlay) {
  const rodando = estado === "rodando";
  const semPassos = totalPassos === 0;
  const noInicio = indiceAtual <= -1;
  const noFim = indiceAtual >= totalPassos - 1;

  // Progresso percentual
  const progresso = totalPassos > 0 ? ((indiceAtual + 1) / totalPassos) * 100 : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 16px 10px",
        background: "oklch(0.13 0.02 240)",
        borderBottom: "1px solid oklch(0.22 0.03 240)",
        flexShrink: 0,
      }}
    >
      {/* Barra de progresso */}
      <div
        style={{
          height: 3,
          background: "oklch(0.22 0.03 240)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progresso}%`,
            background:
              estado === "fim"
                ? "oklch(0.65 0.18 145)"
                : "oklch(0.55 0.18 240)",
            borderRadius: 2,
            transition: "width 200ms ease-out",
          }}
        />
      </div>

      {/* Controles */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {/* Reiniciar */}
        <BotaoIcone
          onClick={onReiniciar}
          disabled={semPassos || noInicio}
          title="Reiniciar"
        >
          ⏮
        </BotaoIcone>

        {/* Retroceder 1 passo */}
        <BotaoIcone
          onClick={onRetroceder}
          disabled={semPassos || noInicio}
          title="Passo anterior"
        >
          ◀
        </BotaoIcone>

        {/* Play / Pause */}
        {rodando ? (
          <BotaoIcone onClick={onPausar} title="Pausar" destaque>
            ⏸
          </BotaoIcone>
        ) : (
          <BotaoIcone
            onClick={onPlay}
            disabled={semPassos || noFim}
            title={estado === "fim" ? "Chegou ao fim — reinicie" : "Play"}
            destaque={!semPassos && !noFim}
          >
            ▶
          </BotaoIcone>
        )}

        {/* Avançar 1 passo */}
        <BotaoIcone
          onClick={onPasso}
          disabled={semPassos || noFim || rodando}
          title="Próximo passo"
        >
          ▶|
        </BotaoIcone>

        {/* Separador */}
        <div
          style={{
            width: 1,
            height: 20,
            background: "oklch(0.28 0.03 240)",
            margin: "0 4px",
          }}
        />

        {/* Velocidades */}
        {velocidades.map((v) => (
          <button
            key={v}
            onClick={() => onMudarVelocidade(v as Velocidade)}
            title={`Velocidade ${LABEL_VELOCIDADE[v] ?? v}`}
            style={{
              background:
                velocidade === v
                  ? "oklch(0.48 0.16 290)"
                  : "oklch(0.18 0.02 240)",
              border: `1.5px solid ${velocidade === v ? "oklch(0.48 0.16 290)" : "oklch(0.28 0.03 240)"}`,
              borderRadius: 5,
              color:
                velocidade === v
                  ? "oklch(0.97 0.01 240)"
                  : "oklch(0.65 0.03 240)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: velocidade === v ? 700 : 500,
              padding: "3px 8px",
              transition: "background 100ms ease-out",
            }}
          >
            {LABEL_VELOCIDADE[v] ?? `${v}×`}
          </button>
        ))}

        {/* Contador de passos */}
        <div
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "oklch(0.5 0.04 240)",
            whiteSpace: "nowrap",
          }}
        >
          {semPassos ? (
            "—"
          ) : (
            <>
              <span style={{ color: "oklch(0.78 0.06 240)", fontWeight: 600 }}>
                {Math.max(0, indiceAtual + 1)}
              </span>
              {" / "}
              {totalPassos}
              {" passos"}
            </>
          )}
          {estado === "fim" && (
            <span
              style={{
                marginLeft: 8,
                color: "oklch(0.65 0.18 145)",
                fontWeight: 700,
                fontSize: 10,
              }}
            >
              FIM
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

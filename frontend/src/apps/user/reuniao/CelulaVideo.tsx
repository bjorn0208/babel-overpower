/**
 * CelulaVideo — tile de vídeo da chamada, estilo Google Meet.
 *
 * Avatar com inicial quando sem vídeo, badge de mic mudo e mão levantada,
 * rótulo de tela compartilhada, clique fixa/solta o destaque e o anfitrião
 * vê botão pra silenciar o participante.
 */

import { useEffect, useRef } from "react";
import { Hand, MicOff, Pin, ScreenShare } from "lucide-react";
import { Avatar, cor } from "./reuniao-ui";

export type DadosTile = {
  chave: string;
  stream: MediaStream | null;
  nome: string;
  ehLocal: boolean;
  ehTela: boolean;
  espelhado: boolean;
  semVideo: boolean;
  micMudo: boolean;
  maoLevantada: boolean;
  /** Participante do time do tenant — borda na cor da marca. */
  doTime?: boolean;
  peerId?: string;
};

type Props = {
  tile: DadosTile;
  fixado: boolean;
  compacto?: boolean;
  /** Modo "mesmo ambiente": silencia o som dos remotos neste aparelho
   *  (outro aparelho do mesmo lugar físico é quem toca o áudio). */
  audioMudo?: boolean;
  onFixar: (chave: string) => void;
  /** Presente só pro anfitrião em tiles remotos de pessoa (não tela). */
  onSilenciar?: (peerId: string) => void;
};

export default function CelulaVideo({ tile, fixado, compacto, audioMudo, onFixar, onSilenciar }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && tile.stream) ref.current.srcObject = tile.stream;
  }, [tile.stream]);

  const mostrarAvatar = !tile.stream || tile.semVideo;
  const tamanhoAvatar = compacto ? 40 : 72;

  return (
    <div
      className="reu-surgir reu-tile"
      role="button"
      tabIndex={0}
      title={fixado ? "Soltar destaque" : "Fixar em destaque"}
      aria-label={`${tile.nome}${fixado ? " (em destaque)" : ""} — clique para ${fixado ? "soltar" : "fixar"}`}
      onClick={() => onFixar(tile.chave)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onFixar(tile.chave);
      }}
      style={{
        position: "relative",
        background: cor.tile,
        borderRadius: compacto ? 12 : 16,
        overflow: "hidden",
        aspectRatio: "16/9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 0,
        cursor: "pointer",
        outline: fixado ? `2px solid ${cor.primario}` : "none",
        outlineOffset: -2,
        // Borda do time: identifica quem é da casa sem depender do rótulo.
        boxShadow: tile.doTime ? `inset 0 0 0 2px ${cor.vivo}` : undefined,
        flexShrink: 0,
      }}
    >
      {tile.stream && (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={tile.ehLocal || audioMudo === true}
          style={{
            width: "100%",
            height: "100%",
            objectFit: tile.ehTela ? "contain" : "cover",
            transform: tile.espelhado ? "scaleX(-1)" : undefined,
            visibility: tile.semVideo ? "hidden" : "visible",
          }}
        />
      )}

      {mostrarAvatar && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Avatar nome={tile.nome} tamanho={tamanhoAvatar} />
        </div>
      )}

      {/* ─ Badges topo ─ */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          right: 8,
          display: "flex",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {tile.maoLevantada && (
            <span
              className="reu-surgir"
              aria-label={`${tile.nome} está com a mão levantada`}
              style={{
                width: compacto ? 24 : 30,
                height: compacto ? 24 : 30,
                borderRadius: "50%",
                background: "oklch(0.78 0.16 85)",
                color: "oklch(0.2 0.05 85)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Hand size={compacto ? 13 : 16} />
            </span>
          )}
          {fixado && !compacto && (
            <span
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "oklch(0.1 0.02 264 / 0.65)",
                color: cor.texto1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(4px)",
              }}
            >
              <Pin size={15} />
            </span>
          )}
        </div>

        {onSilenciar && tile.peerId && !tile.ehTela && !tile.micMudo && (
          <button
            type="button"
            className="reu-btn reu-redondo"
            title={`Silenciar ${tile.nome}`}
            aria-label={`Silenciar o microfone de ${tile.nome}`}
            onClick={(e) => {
              e.stopPropagation();
              onSilenciar(tile.peerId!);
            }}
            style={{ width: compacto ? 26 : 32, height: compacto ? 26 : 32, pointerEvents: "auto" }}
          >
            <MicOff size={compacto ? 13 : 15} />
          </button>
        )}
      </div>

      {/* ─ Rótulo nome ─ */}
      <div
        style={{
          position: "absolute",
          bottom: compacto ? 6 : 10,
          left: compacto ? 6 : 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "oklch(0.1 0.02 264 / 0.7)",
          borderRadius: 999,
          padding: compacto ? "2px 9px" : "4px 12px",
          fontSize: compacto ? 11 : 12,
          fontWeight: 500,
          color: cor.texto1,
          backdropFilter: "blur(4px)",
          maxWidth: "calc(100% - 16px)",
          pointerEvents: "none",
        }}
      >
        {tile.ehTela && <ScreenShare size={compacto ? 11 : 13} aria-label="Tela compartilhada" />}
        {tile.micMudo && !tile.ehTela && (
          <MicOff size={compacto ? 11 : 13} color={cor.perigo} aria-label="Microfone desativado" />
        )}
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {tile.nome}
        </span>
      </div>
    </div>
  );
}

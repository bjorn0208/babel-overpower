/**
 * BarraControles — barra inferior da chamada, estilo Google Meet.
 * Desktop: relógio + título à esquerda, controles no centro, contagem à direita.
 * Mobile: só os controles, centralizados. Anfitrião ganha menu
 * "sair / encerrar para todos" no pill vermelho.
 */

import { useEffect, useState } from "react";
import {
  Check,
  FileText,
  Hand,
  Headphones,
  Link2,
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { BotaoRedondo, cor } from "./reuniao-ui";

type Props = {
  mutado: boolean;
  semVideo: boolean;
  compartilhandoTela: boolean;
  maoLevantada: boolean;
  /** Modo "mesmo ambiente" ativo — este aparelho sem mic e sem som. */
  mesmoAmbiente: boolean;
  ehMobile: boolean;
  tituloSala?: string;
  totalParticipantes: number;
  onMicrofone: () => void;
  onCamera: () => void;
  onTela: () => void;
  onMao: () => void;
  onMesmoAmbiente: () => void;
  onSair: () => void;
  onEncerrar?: () => void;
  onCopiarLink?: () => void;
  /** Anfitrião: abre o menu de recursos da call (contrato etc.). */
  onRecursos?: () => void;
};

function useRelogio(): string {
  const [hora, setHora] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return hora;
}

export default function BarraControles({
  mutado,
  semVideo,
  compartilhandoTela,
  maoLevantada,
  mesmoAmbiente,
  ehMobile,
  tituloSala,
  totalParticipantes,
  onMicrofone,
  onCamera,
  onTela,
  onMao,
  onMesmoAmbiente,
  onSair,
  onEncerrar,
  onCopiarLink,
  onRecursos,
}: Props) {
  const hora = useRelogio();
  const [menuSair, setMenuSair] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const tamanho = ehMobile ? 46 : 50;

  function copiar() {
    onCopiarLink?.();
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function cliqueSair() {
    if (onEncerrar) setMenuSair((v) => !v);
    else onSair();
  }

  const estiloItemMenu = {
    justifyContent: "flex-start",
    gap: 10,
    padding: "10px 12px",
    fontSize: 13.5,
    fontWeight: 500,
  } as const;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: ehMobile ? "center" : "space-between",
        gap: 12,
        padding: ehMobile ? "10px 12px 14px" : "12px 24px 16px",
        flexShrink: 0,
      }}
    >
      {!ehMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: cor.texto1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {hora}
          </span>
          {tituloSala && (
            <>
              <span style={{ color: cor.texto3 }} aria-hidden>
                |
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: cor.texto2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {tituloSala}
              </span>
            </>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: ehMobile ? 8 : 10,
          position: "relative",
        }}
      >
        <BotaoRedondo
          rotulo={mutado ? "Ativar microfone" : "Desativar microfone"}
          desligado={mutado}
          onClick={onMicrofone}
          tamanho={tamanho}
        >
          {mutado ? <MicOff size={21} /> : <Mic size={21} />}
        </BotaoRedondo>

        <BotaoRedondo
          rotulo={semVideo ? "Ativar câmera" : "Desativar câmera"}
          desligado={semVideo}
          onClick={onCamera}
          tamanho={tamanho}
        >
          {semVideo ? <VideoOff size={21} /> : <Video size={21} />}
        </BotaoRedondo>

        {!ehMobile && (
          <BotaoRedondo
            rotulo={compartilhandoTela ? "Parar de compartilhar a tela" : "Compartilhar a tela"}
            onClick={onTela}
          >
            {compartilhandoTela ? (
              <ScreenShareOff size={21} color={cor.vivo} />
            ) : (
              <ScreenShare size={21} />
            )}
          </BotaoRedondo>
        )}

        {onRecursos && (
          <BotaoRedondo rotulo="Recursos da call (contrato…)" onClick={onRecursos} tamanho={tamanho}>
            <FileText size={21} />
          </BotaoRedondo>
        )}

        <button
          type="button"
          className="reu-btn reu-redondo"
          onClick={onMesmoAmbiente}
          title={
            mesmoAmbiente
              ? "Sair do modo mesmo ambiente (religar som deste aparelho)"
              : "Estou no mesmo ambiente que outra pessoa da reunião (desliga mic e som deste aparelho)"
          }
          aria-label={
            mesmoAmbiente ? "Sair do modo mesmo ambiente" : "Ativar modo mesmo ambiente"
          }
          aria-pressed={mesmoAmbiente}
          style={{
            width: tamanho,
            height: tamanho,
            background: mesmoAmbiente ? "oklch(0.72 0.15 200)" : undefined,
            color: mesmoAmbiente ? "oklch(0.18 0.04 200)" : undefined,
          }}
        >
          <Headphones size={21} />
        </button>

        <button
          type="button"
          className="reu-btn reu-redondo"
          onClick={onMao}
          title={maoLevantada ? "Abaixar a mão" : "Levantar a mão"}
          aria-label={maoLevantada ? "Abaixar a mão" : "Levantar a mão"}
          aria-pressed={maoLevantada}
          style={{
            width: tamanho,
            height: tamanho,
            background: maoLevantada ? "oklch(0.78 0.16 85)" : undefined,
            color: maoLevantada ? "oklch(0.2 0.05 85)" : undefined,
          }}
        >
          <Hand size={21} />
        </button>

        {onCopiarLink && (
          <BotaoRedondo
            rotulo={copiado ? "Link copiado" : "Copiar link da reunião"}
            onClick={copiar}
            tamanho={tamanho}
          >
            {copiado ? <Check size={21} color={cor.vivo} /> : <Link2 size={21} />}
          </BotaoRedondo>
        )}

        <button
          type="button"
          className="reu-btn reu-pill-perigo"
          onClick={cliqueSair}
          title="Sair da chamada"
          aria-label="Sair da chamada"
          style={{ height: tamanho }}
        >
          <PhoneOff size={21} />
        </button>

        {menuSair && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
              onClick={() => setMenuSair(false)}
              aria-hidden
            />
            <div
              className="reu-surgir"
              style={{
                position: "absolute",
                bottom: "calc(100% + 10px)",
                right: 0,
                zIndex: 41,
                background: "oklch(0.19 0.035 264)",
                border: `1px solid ${cor.borda}`,
                borderRadius: 12,
                padding: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                boxShadow: "0 8px 24px oklch(0.05 0.01 264 / 0.5)",
                minWidth: 200,
              }}
            >
              <button
                type="button"
                className="reu-btn reu-btn-fantasma"
                style={estiloItemMenu}
                onClick={() => {
                  setMenuSair(false);
                  onSair();
                }}
              >
                <PhoneOff size={16} aria-hidden /> Sair da chamada
              </button>
              <button
                type="button"
                className="reu-btn reu-btn-fantasma"
                style={{ ...estiloItemMenu, color: cor.perigo }}
                onClick={() => {
                  setMenuSair(false);
                  onEncerrar?.();
                }}
              >
                <PhoneOff size={16} aria-hidden /> Encerrar para todos
              </button>
            </div>
          </>
        )}
      </div>

      {!ehMobile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 6,
            flex: 1,
            color: cor.texto2,
            fontSize: 13,
          }}
        >
          <Users size={16} aria-hidden />
          <span aria-label={`${totalParticipantes} participantes na chamada`}>
            {totalParticipantes}
          </span>
        </div>
      )}
    </div>
  );
}

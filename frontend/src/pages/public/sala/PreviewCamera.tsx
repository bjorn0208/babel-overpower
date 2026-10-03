/**
 * PreviewCamera — pré-visualização da câmera no pré-join da sala pública.
 *
 * Pede getUserMedia ao montar, mostra o vídeo espelhado (como o Google Meet)
 * e expõe toggles de microfone/câmera que valem como preferência inicial
 * da chamada. Para os tracks no unmount.
 */

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Avatar, BotaoRedondo, cor } from "@/apps/user/reuniao/reuniao-ui";

type Props = {
  nome: string;
  micDesligado: boolean;
  camDesligada: boolean;
  onAlternarMic: () => void;
  onAlternarCam: () => void;
};

export default function PreviewCamera({
  nome,
  micDesligado,
  camDesligada,
  onAlternarMic,
  onAlternarCam,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [pronto, setPronto] = useState(false);

  // ─ Liga a câmera ao montar; desliga ao desmontar ─
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (!vivo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPronto(true);
      } catch {
        if (vivo) setSemPermissao(true);
      }
    })();
    return () => {
      vivo = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ─ Toggles refletem nos tracks do preview ─
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !micDesligado;
    });
  }, [micDesligado, pronto]);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !camDesligada;
    });
  }, [camDesligada, pronto]);

  const mostrarVideo = pronto && !camDesligada && !semPermissao;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        background: cor.tile,
        borderRadius: 20,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 10px 30px oklch(0.05 0.01 264 / 0.4)",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",
          display: mostrarVideo ? "block" : "none",
        }}
      />

      {!mostrarVideo && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            color: cor.texto2,
            padding: 16,
            textAlign: "center",
          }}
        >
          {semPermissao ? (
            <>
              <VideoOff size={32} aria-hidden />
              <span style={{ fontSize: 13.5 }}>
                Sem acesso à câmera. Verifique as permissões do navegador.
              </span>
            </>
          ) : !pronto ? (
            <span style={{ fontSize: 13.5 }}>Preparando sua câmera…</span>
          ) : (
            <>
              <Avatar nome={nome || "Convidado"} tamanho={72} />
              <span style={{ fontSize: 13.5 }}>Câmera desligada</span>
            </>
          )}
        </div>
      )}

      {/* ─ Controles sobre o preview, como no Meet ─ */}
      {!semPermissao && (
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <BotaoRedondo
            rotulo={micDesligado ? "Ativar microfone" : "Desativar microfone"}
            desligado={micDesligado}
            onClick={onAlternarMic}
          >
            {micDesligado ? <MicOff size={20} /> : <Mic size={20} />}
          </BotaoRedondo>
          <BotaoRedondo
            rotulo={camDesligada ? "Ativar câmera" : "Desativar câmera"}
            desligado={camDesligada}
            onClick={onAlternarCam}
          >
            {camDesligada ? <VideoOff size={20} /> : <Video size={20} />}
          </BotaoRedondo>
        </div>
      )}

      {nome.trim() && (
        <span
          style={{
            position: "absolute",
            top: 12,
            left: 14,
            fontSize: 12.5,
            fontWeight: 500,
            color: cor.texto1,
            background: "oklch(0.1 0.02 264 / 0.6)",
            borderRadius: 999,
            padding: "4px 12px",
            backdropFilter: "blur(4px)",
          }}
        >
          {nome.trim()}
        </span>
      )}
    </div>
  );
}

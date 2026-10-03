/**
 * PpStepsMidia — steps de selfie e documento (RG/CNH).
 * StepAssinatura vive em arquivo próprio (StepAssinatura.tsx).
 */

import { useEffect, useRef, useState } from "react";
import type { DadosContrato } from "./tipos";
import { PpAcoes, PpUpload } from "./PpShared";
import { PpIcone } from "./PpIcone";
import { INSTRUCAO_SELFIE_MAP } from "./helpers";

/* =========================================================================
   Step: Selfie (câmera ao vivo)
   ========================================================================= */
type EstadoCamera = "iniciando" | "pronta" | "capturada" | "erro";

export function StepSelfie({
  contrato,
  urlSelfie,
  setUrlSelfie,
  upload,
  onAvancar,
  onVoltar,
}: {
  contrato: DadosContrato;
  urlSelfie: string | null;
  setUrlSelfie: (v: string | null) => void;
  upload: (f: File, p: string) => Promise<string | null>;
  onAvancar: () => void;
  onVoltar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<EstadoCamera>(
    urlSelfie ? "capturada" : "iniciando"
  );
  const [erroMsg, setErroMsg] = useState("");
  // Preview local imediato (object URL do blob); urlSelfie guarda a URL pública
  // do storage após o upload (não mais base64 inline).
  const [preview, setPreview] = useState<string | null>(urlSelfie);
  const [salvando, setSalvando] = useState(false);

  const instrucao = contrato.instrucao_selfie
    ? (INSTRUCAO_SELFIE_MAP[contrato.instrucao_selfie] ??
      contrato.instrucao_selfie)
    : "Posicione o rosto no quadro e clique em tirar foto.";

  useEffect(() => {
    if (estado !== "iniciando") return;
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setEstado("pronta");
      } catch (e) {
        const err = e as { name?: string };
        setEstado("erro");
        setErroMsg(
          err.name === "NotAllowedError"
            ? "Você precisa permitir acesso à câmera pra continuar."
            : err.name === "NotFoundError"
            ? "Não encontramos uma câmera neste dispositivo."
            : "Não conseguimos abrir a câmera. Tente recarregar a página."
        );
      }
    })();
    // Só cancela o async em voo. NÃO paramos o stream aqui: este cleanup também
    // roda na transição "iniciando" → "pronta" (dep [estado]) e mataria a câmera
    // recém-aberta (vídeo preto). O stream é parado em tirarFoto e no unmount.
    return () => {
      cancelado = true;
    };
  }, [estado]);

  // Para a câmera só ao desmontar o step (sair da selfie sem capturar).
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function tirarFoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setEstado("capturada");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.92)
    );
    if (!blob) return;
    setPreview(URL.createObjectURL(blob));
    setSalvando(true);
    const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
    const url = await upload(file, "selfie");
    if (url) setUrlSelfie(url);
    setSalvando(false);
  }

  function refazer() {
    setUrlSelfie(null);
    setPreview(null);
    setEstado("iniciando");
  }

  return (
    <div className="pp-fade">
      <div className="pp-step-icon">
        <PpIcone nome="camera" tamanho={20} />
      </div>
      <h2 className="pp-step-title">Selfie ao vivo</h2>
      <p className="pp-step-sub">{instrucao}</p>

      <div className="pp-camera-frame">
        {estado === "iniciando" && (
          <div className="pp-camera-status">
            <div className="pp-camera-spinner" />
            <div style={{ marginTop: 12 }}>Abrindo câmera…</div>
            <div style={{ fontSize: 11.5, color: "var(--pp-ink-4)", marginTop: 4 }}>
              Permita o acesso quando o navegador pedir.
            </div>
          </div>
        )}
        {estado === "erro" && (
          <div className="pp-camera-status" style={{ color: "var(--pp-rose)" }}>
            <PpIcone nome="warn" tamanho={28} />
            <div style={{ marginTop: 10, fontWeight: 600 }}>Câmera indisponível</div>
            <div style={{ fontSize: 12, color: "var(--pp-ink-3)", marginTop: 4, maxWidth: 260 }}>
              {erroMsg}
            </div>
            <button
              className="pp-link"
              type="button"
              onClick={() => setEstado("iniciando")}
              style={{ marginTop: 12 }}
            >
              Tentar de novo
            </button>
          </div>
        )}
        {(estado === "iniciando" || estado === "pronta") && (
          <video
            ref={videoRef}
            playsInline
            muted
            className="pp-camera-video"
            style={{ display: estado === "pronta" ? "block" : "none", transform: "scaleX(-1)" }}
          />
        )}
        {estado === "capturada" && (preview || urlSelfie) && (
          <img src={preview ?? urlSelfie ?? ""} alt="Selfie" className="pp-camera-video" />
        )}
        {(estado === "pronta" || estado === "iniciando") && (
          <div className="pp-camera-overlay">
            <div className="pp-camera-oval" />
          </div>
        )}
      </div>

      {estado === "pronta" && (
        <button className="pp-shutter" type="button" onClick={tirarFoto} title="Tirar foto">
          <span className="pp-shutter-inner" />
        </button>
      )}
      {estado === "capturada" && (
        <div className="pp-actions" style={{ marginTop: 14 }}>
          <button className="pp-btn pp-btn-ghost" type="button" onClick={refazer} disabled={salvando}>
            <PpIcone nome="camera" tamanho={13} /> Tirar de novo
          </button>
          <button
            className="pp-btn pp-btn-primary"
            type="button"
            onClick={onAvancar}
            disabled={salvando || !urlSelfie}
          >
            {salvando ? "Salvando…" : "Continuar"} <PpIcone nome="chevr" tamanho={14} />
          </button>
        </div>
      )}
      {estado !== "capturada" && (
        <div className="pp-actions" style={{ marginTop: 14 }}>
          <button className="pp-btn pp-btn-ghost" type="button" onClick={onVoltar}>
            <PpIcone nome="chevl" tamanho={14} /> Voltar
          </button>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   Step: Documento (RG/CNH)
   ========================================================================= */
export function StepDocumento({
  urlDocumento,
  setUrlDocumento,
  upload,
  onAvancar,
  onVoltar,
}: {
  urlDocumento: string | null;
  setUrlDocumento: (v: string | null) => void;
  upload: (f: File, p: string) => Promise<string | null>;
  onAvancar: () => void;
  onVoltar: () => void;
}) {
  const [carregando, setCarregando] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCarregando(true);
    const url = await upload(f, "documento");
    setUrlDocumento(url);
    setCarregando(false);
  }

  return (
    <div className="pp-fade">
      <div className="pp-step-icon">
        <PpIcone nome="id" tamanho={20} />
      </div>
      <h2 className="pp-step-title">Documento com foto</h2>
      <p className="pp-step-sub">
        Envie uma foto nítida do seu RG ou CNH (frente). A imagem é usada
        apenas para validar sua identidade.
      </p>
      <PpUpload
        url={urlDocumento}
        onChange={handleFile}
        carregando={carregando}
        label="Selecionar imagem do documento"
        iconeName="id"
      />
      <PpAcoes
        onVoltar={onVoltar}
        onAvancar={onAvancar}
        avancarDisabled={!urlDocumento}
      />
    </div>
  );
}

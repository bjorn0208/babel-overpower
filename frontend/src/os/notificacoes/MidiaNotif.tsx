/**
 * Mídia da mensagem dentro do card de notificação.
 *
 * Em vez do placeholder textual, mostra o anexo de verdade:
 *  - imagem  → thumbnail
 *  - áudio   → player nativo compacto
 *  - vídeo   → player nativo
 *  - documento (ou falha de carregamento) → pill-link que abre em nova aba
 */

import { useState } from "react";

interface MidiaNotifProps {
  url: string;
  tipo: string; // image | audio | video | document
}

const LABEL: Record<string, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
};

export function MidiaNotif({ url, tipo }: MidiaNotifProps) {
  const [erro, setErro] = useState(false);

  if (!erro) {
    if (tipo === "image") {
      return (
        <img
          className="notif-midia-img"
          src={url}
          alt=""
          loading="lazy"
          onError={() => setErro(true)}
        />
      );
    }
    if (tipo === "audio") {
      return (
        <audio
          className="notif-midia-audio"
          src={url}
          controls
          preload="none"
          onError={() => setErro(true)}
        />
      );
    }
    if (tipo === "video") {
      return (
        <video
          className="notif-midia-video"
          src={url}
          controls
          preload="none"
          onError={() => setErro(true)}
        />
      );
    }
  }

  // Documento ou fallback de erro: pill que abre o anexo.
  return (
    <a
      className="notif-midia-pill"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      {LABEL[tipo] ?? "Anexo"}
    </a>
  );
}

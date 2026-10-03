/**
 * ModalRecursoAberto — recurso que o anfitrião mandou abrir na call.
 *
 * Abre o link (ex.: contrato público de assinatura) num painel sobre a
 * chamada — o participante lê e assina sem sair da reunião. O X só fecha o
 * painel; o link continua válido se quiser abrir depois.
 */

import { ExternalLink, X } from "lucide-react";
import { cor } from "./reuniao-ui";

type Props = {
  url: string;
  titulo: string;
  aoFechar: () => void;
};

export default function ModalRecursoAberto({ url, titulo, aoFechar }: Props) {
  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 40, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "oklch(0.05 0.01 264 / 0.65)", backdropFilter: "blur(3px)",
      }}
    >
      <div
        className="reu-surgir"
        style={{
          width: "min(760px, calc(100% - 24px))", height: "min(86%, 780px)",
          background: cor.fundo, border: `1px solid ${cor.borda}`, borderRadius: 18,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, padding: "10px 14px", borderBottom: `1px solid ${cor.borda}`,
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 700, color: cor.texto1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {titulo}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Abrir em outra aba"
              style={{ color: cor.texto2, display: "grid", placeItems: "center", padding: 6 }}
            >
              <ExternalLink size={15} />
            </a>
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar recurso"
              style={{ background: "transparent", border: "none", color: cor.texto2, cursor: "pointer", padding: 6 }}
            >
              <X size={17} />
            </button>
          </div>
        </div>
        {/*
          SEGURANÇA: o link é aberto por comando de outro participante da call.
          NÃO conceder câmera/microfone ao iframe (era `allow="camera; microphone"`
          — abria porta pra site arbitrário capturar mídia). O `sandbox` isola o
          conteúdo: deixa só o que uma página de documento/assinatura precisa
          (rodar script, enviar formulário, abrir link/baixar). A URL já vem
          saneada (só http/https) de use-livekit → sanitizarUrlRecurso.
        */}
        <iframe
          src={url}
          title={titulo}
          style={{ flex: 1, border: "none", background: "oklch(0.98 0 0)" }}
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-downloads"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}

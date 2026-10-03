/**
 * Modal de leitura e aceite dos Termos de Uso.
 * Usado na página pública /cadastro — não depende do OS bundle.
 */

import { X } from "lucide-react";

type Props = {
  texto: string;
  onClose: () => void;
  onAceitar: () => void;
};

const COR = "#6366f1";

export function TermosModal({ texto, onClose, onAceitar }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Termos de Uso"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 18,
          background: "#fff",
          boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid #e4e4e7",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: "#18181b" }}>
            Termos de Uso
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar termos"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "#71717a",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div
          style={{
            maxHeight: "55vh",
            overflowY: "auto",
            padding: "16px 20px",
          }}
        >
          <p
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              color: "#3f3f46",
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {texto}
          </p>
        </div>

        {/* Rodapé */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 20px",
            borderTop: "1px solid #e4e4e7",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid #e4e4e7",
              borderRadius: 10,
              padding: "8px 16px",
              fontSize: 13,
              color: "#71717a",
              cursor: "pointer",
            }}
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={onAceitar}
            style={{
              background: COR,
              border: "none",
              borderRadius: 10,
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Aceitar Termos
          </button>
        </div>
      </div>
    </div>
  );
}

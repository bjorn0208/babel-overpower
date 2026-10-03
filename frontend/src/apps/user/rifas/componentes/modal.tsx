import type React from "react";
import { useEffect } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo?: string;
  subtitulo?: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  tamanho?: "sm" | "md" | "lg" | "xl";
}

/**
 * Modal do app Rifas (Arena). No celular é folha de baixo com alça; no desktop, centrado.
 * Posição, fundo, raio e animação vêm de `.rifas-modal-wrap` / `.rifas-modal` no rifas.css.
 */
export const Modal = ({ aberto, aoFechar, titulo, subtitulo, children, rodape, tamanho = "md" }: ModalProps) => {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  const larguras = { sm: 420, md: 560, lg: 720, xl: 960 };

  return (
    <div className="rifas-modal-wrap" onClick={aoFechar}>
      <div
        className="rifas-modal flex flex-col"
        style={{ maxWidth: larguras[tamanho] }}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-3">
          <div className="min-w-0">
            {titulo && <h3 className="ar-titulo-secao">{titulo}</h3>}
            {subtitulo && <p className="text-sm ar-txt-3 mt-1">{subtitulo}</p>}
          </div>
          <button type="button" onClick={aoFechar} className="ar-icone-btn -mr-2 -mt-1" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pb-2">{children}</div>

        {rodape && (
          <div className="pt-4 mt-2 flex flex-wrap gap-2 justify-end" style={{ borderTop: "1px solid var(--ar-filete)" }}>
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
};

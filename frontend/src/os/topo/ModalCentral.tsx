/**
 * Shell de modal centralizado de verdade: o backdrop usa flexbox pra centralizar
 * o conteúdo, então não dependemos de `transform: translate(-50%,-50%)` — que a
 * keyframe `janelaIn` do `.modal` legado sobrescrevia, fazendo o modal nascer no
 * canto e "quicar" pro centro. Aqui a entrada é só um fade (sem deslocamento).
 *
 * Clicar no backdrop fecha; clicar dentro não propaga.
 */

import type { ReactNode } from "react";

interface ModalCentralProps {
  children: ReactNode;
  onClose: () => void;
  width?: number;
  ariaLabel?: string;
  ariaLabelledby?: string;
}

export function ModalCentral({
  children,
  onClose,
  width = 400,
  ariaLabel,
  ariaLabelledby,
}: ModalCentralProps) {
  return (
    <div
      className="modal-backdrop"
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "oklch(0.13 0.03 264 / 0.97)",
          border: "1px solid var(--os-vidro-borda-forte)",
          borderRadius: 16,
          boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
          padding: 24,
          zIndex: 95,
          animation: "fadeIn 160ms ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}

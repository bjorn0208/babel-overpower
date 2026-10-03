import React from "react";

export interface BotaoProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: "primario" | "secundario" | "contorno" | "fantasma" | "perigo" | "sucesso";
  tamanho?: "sm" | "md" | "lg";
  carregando?: boolean;
  larguraTotal?: boolean;
}

/**
 * Botão do app Rifas — identidade Arena (skill design-rifas, 2026-09-12).
 * Uma cor de ação (roxo), sem borda, sem caixa alta. `perigo` continua vermelho:
 * apagar/rejeitar nunca tem a cara de confirmar. Alvo de toque ≥48px no `md`.
 */
const VARIANTES: Record<NonNullable<BotaoProps["variante"]>, React.CSSProperties> = {
  primario: { background: "var(--ar-roxo)", color: "var(--ar-roxo-tinta)", boxShadow: "var(--ar-roxo-glow)" },
  secundario: { background: "var(--ar-cartao-alto)", color: "var(--ar-txt-1)" },
  contorno: { background: "transparent", color: "var(--ar-txt-1)", boxShadow: "inset 0 0 0 1px var(--ar-filete-forte)" },
  fantasma: { background: "transparent", color: "var(--ar-txt-2)" },
  perigo: { background: "var(--ar-erro)", color: "#fff" },
  sucesso: { background: "var(--ar-ok)", color: "#0b0b10" },
};

const TAMANHOS = {
  sm: "px-3.5 text-sm gap-1.5 min-h-[40px]",
  md: "px-5 text-base gap-2 min-h-[48px]",
  lg: "px-7 text-lg gap-2.5 min-h-[56px]",
};

export const Botao = React.forwardRef<HTMLButtonElement, BotaoProps>(
  (
    { children, variante = "primario", tamanho = "md", carregando = false, larguraTotal = false, disabled, className = "", style, ...props },
    ref,
  ) => {
    const base = `
      ar-botao ar-botao--${variante}
      inline-flex items-center justify-center font-medium rounded-[var(--ar-r-lg)]
      transition-[transform,filter,background] duration-150 ease-out
      hover:brightness-110 active:scale-[0.97]
      focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ar-roxo-alto)]
      disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:pointer-events-none
      select-none whitespace-nowrap
    `;

    return (
      <button
        ref={ref}
        disabled={disabled || carregando}
        aria-busy={carregando || undefined}
        className={`${base} ${TAMANHOS[tamanho]} ${larguraTotal ? "w-full" : ""} ${className}`}
        style={{ ...VARIANTES[variante], ...style }}
        {...props}
      >
        {carregando && (
          <svg className="animate-spin h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {/* Mantém o rótulo enquanto carrega: largura estável e o usuário sabe O QUE está carregando. */}
        <span className="inline-flex items-center gap-2">{children}</span>
      </button>
    );
  },
);

Botao.displayName = "Botao";

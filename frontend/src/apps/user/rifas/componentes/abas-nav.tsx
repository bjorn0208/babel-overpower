import React from "react";

export interface ItemAba {
  id: string;
  rotulo: string;
  contagem?: number;
}

export interface NavAbasProps {
  abas: ItemAba[];
  abaAtiva: string;
  aoMudar: (id: string) => void;
  className?: string;
}

/** Filtros em chips roláveis (Arena): pílula chumbo, ativa roxa. Rola em X, nunca quebra no celular. */
export const NavAbas = ({ abas, abaAtiva, aoMudar, className = "" }: NavAbasProps) => (
  <div className={`ar-scroll-x -mx-4 px-4 ${className}`} role="tablist">
    {abas.map((aba) => {
      const ativa = aba.id === abaAtiva;
      return (
        <button
          key={aba.id}
          type="button"
          role="tab"
          aria-selected={ativa}
          onClick={() => aoMudar(aba.id)}
          className={`ar-chip ${ativa ? "ar-chip--ativo" : ""}`}
        >
          <span>{aba.rotulo}</span>
          {aba.contagem !== undefined && aba.contagem > 0 && (
            <span
              className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={ativa ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : { background: "var(--ar-roxo-vidro)", color: "var(--ar-roxo-alto)" }}
            >
              {aba.contagem > 99 ? "99+" : aba.contagem}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

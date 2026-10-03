import React from "react";

/**
 * Campos do app Rifas — identidade Arena. Fundo chumbo, sem borda, foco em anel roxo,
 * 16px no celular (o iOS não dá zoom), alvo de 48px.
 */
const baseCampo = `
  ar-campo w-full px-4 rounded-[var(--ar-r-md)] min-h-[48px]
  bg-[var(--ar-cartao-alto)] text-[var(--ar-txt-1)] placeholder:text-[var(--ar-txt-4)]
  border-0 outline-none transition-shadow duration-150
  disabled:opacity-50 disabled:cursor-not-allowed
`;

const anelDe = (erro?: string) =>
  erro
    ? "shadow-[0_0_0_2px_var(--ar-erro)] focus:shadow-[0_0_0_2px_var(--ar-erro)]"
    : "focus:shadow-[0_0_0_2px_var(--ar-roxo)]";

const Rotulo = ({ children }: { children: React.ReactNode }) => (
  <label className="ar-rotulo block mb-1.5">{children}</label>
);

const Mensagens = ({ erro, dica }: { erro?: string; dica?: string }) => (
  <>
    {erro && <p className="mt-1.5 text-sm" style={{ color: "var(--ar-erro)" }}>{erro}</p>}
    {!erro && dica && <p className="mt-1.5 text-sm ar-txt-3">{dica}</p>}
  </>
);

export interface CampoProps extends React.InputHTMLAttributes<HTMLInputElement> {
  rotulo?: string;
  erro?: string;
  dica?: string;
  iconeEsquerda?: React.ReactNode;
}

export const Campo = React.forwardRef<HTMLInputElement, CampoProps>(
  ({ rotulo, erro, dica, iconeEsquerda, className = "", ...props }, ref) => (
    <div className="w-full">
      {rotulo && <Rotulo>{rotulo}</Rotulo>}
      <div className="relative">
        {iconeEsquerda && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 ar-txt-3 pointer-events-none">
            {iconeEsquerda}
          </span>
        )}
        <input
          ref={ref}
          className={`${baseCampo} ${anelDe(erro)} ${iconeEsquerda ? "pl-11" : ""} ${className}`}
          {...props}
        />
      </div>
      <Mensagens erro={erro} dica={dica} />
    </div>
  ),
);

Campo.displayName = "Campo";

export interface AreaTextoProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  rotulo?: string;
  erro?: string;
  dica?: string;
}

export const AreaTexto = React.forwardRef<HTMLTextAreaElement, AreaTextoProps>(
  ({ rotulo, erro, dica, className = "", ...props }, ref) => (
    <div className="w-full">
      {rotulo && <Rotulo>{rotulo}</Rotulo>}
      <textarea
        ref={ref}
        className={`${baseCampo} py-3 resize-y min-h-[100px] ${anelDe(erro)} ${className}`}
        {...props}
      />
      <Mensagens erro={erro} dica={dica} />
    </div>
  ),
);

AreaTexto.displayName = "AreaTexto";

export interface SelecaoProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  rotulo?: string;
  erro?: string;
  dica?: string;
  opcoes: { valor: string; rotulo: string }[];
  placeholder?: string;
}

const SETA =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.55)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")";

export const Selecao = React.forwardRef<HTMLSelectElement, SelecaoProps>(
  ({ rotulo, erro, dica, opcoes, placeholder, className = "", style, ...props }, ref) => (
    <div className="w-full">
      {rotulo && <Rotulo>{rotulo}</Rotulo>}
      <select
        ref={ref}
        className={`${baseCampo} appearance-none cursor-pointer ${anelDe(erro)} ${className}`}
        style={{
          backgroundImage: SETA,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center",
          paddingRight: "40px",
          colorScheme: "dark",
          ...style,
        }}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <Mensagens erro={erro} dica={dica} />
    </div>
  ),
);

Selecao.displayName = "Selecao";

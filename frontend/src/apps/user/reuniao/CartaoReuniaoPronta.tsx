/**
 * CartaoReuniaoPronta — card flutuante "Sua reunião está pronta", estilo Meet.
 * Aparece pro anfitrião logo após criar a sala, com o link compartilhável.
 */

import { useState } from "react";
import { Check, Link2, ShieldCheck, X } from "lucide-react";
import { cor } from "./reuniao-ui";

type Props = {
  link: string;
  onCopiar: () => void;
  onFechar: () => void;
  /** Sala de espera: anfitrião aprova quem entra pelo link. */
  aprovacaoAtiva?: boolean;
  onAlternarAprovacao?: (ativar: boolean) => void;
};

export default function CartaoReuniaoPronta({
  link,
  onCopiar,
  onFechar,
  aprovacaoAtiva,
  onAlternarAprovacao,
}: Props) {
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    onCopiar();
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div
      className="reu-surgir"
      role="dialog"
      aria-label="Sua reunião está pronta"
      style={{
        position: "absolute",
        left: 16,
        bottom: 88,
        zIndex: 30,
        background: "oklch(0.18 0.035 264)",
        border: `1px solid ${cor.borda}`,
        borderRadius: 16,
        padding: "16px 18px",
        width: "min(340px, calc(100vw - 32px))",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "0 12px 32px oklch(0.05 0.01 264 / 0.55)",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
      >
        <span style={{ fontSize: 14.5, fontWeight: 600, color: cor.texto1 }}>
          Sua reunião está pronta
        </span>
        <button
          type="button"
          className="reu-btn reu-btn-fantasma"
          onClick={onFechar}
          title="Fechar"
          aria-label="Fechar aviso"
          style={{ width: 32, height: 32 }}
        >
          <X size={16} />
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: cor.texto2, lineHeight: 1.5 }}>
        Compartilhe este link com quem você quer na chamada. Não precisa de conta pra entrar.
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "oklch(0.13 0.025 264)",
          borderRadius: 10,
          padding: "9px 12px",
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            color: cor.texto1,
            fontFamily: "ui-monospace, monospace",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
          }}
        >
          {link}
        </span>
        <button
          type="button"
          className="reu-btn reu-btn-fantasma"
          onClick={copiar}
          title={copiado ? "Link copiado" : "Copiar link"}
          aria-label={copiado ? "Link copiado" : "Copiar link"}
          style={{ width: 34, height: 34 }}
        >
          {copiado ? <Check size={16} color={cor.vivo} /> : <Link2 size={16} />}
        </button>
      </div>

      {onAlternarAprovacao && (
        <button
          type="button"
          role="switch"
          aria-checked={aprovacaoAtiva ?? false}
          className="reu-btn"
          onClick={() => onAlternarAprovacao(!aprovacaoAtiva)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "transparent",
            border: "none",
            padding: "4px 0 0",
            textAlign: "left",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 34,
              height: 20,
              borderRadius: 999,
              background: aprovacaoAtiva ? cor.primario : "oklch(0.28 0.04 264)",
              position: "relative",
              flexShrink: 0,
              transition: "background 150ms ease-out",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: aprovacaoAtiva ? 16 : 2,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "oklch(0.97 0.005 264)",
                transition: "left 160ms cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              color: cor.texto2,
            }}
          >
            <ShieldCheck size={14} aria-hidden color={aprovacaoAtiva ? cor.vivo : cor.texto3} />
            {aprovacaoAtiva ? "Você aprova quem entra" : "Entrada liberada pelo link"}
          </span>
        </button>
      )}
    </div>
  );
}

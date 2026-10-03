// Painel central: o System Prompt CRESCENDO tijolo por tijolo.
// Até a penúltima região: mostra o acumulado das regiões percorridas.
// Região final: mostra o prompt_completo literal + selo de fidelidade.

import { useMemo } from "react";
import type { BlocosPrompt } from "./tipos-construcao";
import { REGIOES, montarParcial } from "./regioes-mapa";

interface Props {
  blocos: BlocosPrompt | null;
  promptCompleto: string;
  passoIdx: number;
}

export default function PromptIncremental({
  blocos,
  promptCompleto,
  passoIdx,
}: Props) {
  const ehFinal = passoIdx >= REGIOES.length - 1;

  const texto = useMemo(() => {
    if (passoIdx < 0) return "";
    if (ehFinal) return promptCompleto;
    return montarParcial(blocos, passoIdx);
  }, [blocos, promptCompleto, passoIdx, ehFinal]);

  const parcialLen = texto.length;
  const totalLen = promptCompleto.length;
  const pct = totalLen > 0 ? Math.round((parcialLen / totalLen) * 100) : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "oklch(0.12 0.02 240)",
        border: "1px solid oklch(0.22 0.03 240)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: "1px solid oklch(0.20 0.03 240)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "oklch(0.6 0.05 240)",
          }}
        >
          System Prompt sendo montado
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "oklch(0.55 0.04 240)" }}>
          {parcialLen.toLocaleString("pt-BR")} / {totalLen.toLocaleString("pt-BR")} chars
        </span>
        {ehFinal && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 999,
              background: "oklch(0.30 0.12 145)",
              border: "1px solid oklch(0.55 0.16 145)",
              color: "oklch(0.95 0.03 145)",
            }}
          >
            ✓ texto real enviado ao LLM
          </span>
        )}
      </div>

      {/* Barra de progresso da montagem */}
      <div style={{ height: 3, background: "oklch(0.18 0.02 240)", flexShrink: 0 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "oklch(0.70 0.16 145)",
            transition: "width 240ms cubic-bezier(0.23,1,0.32,1)",
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
        }}
      >
        {passoIdx < 0 ? (
          <div
            style={{
              color: "oklch(0.5 0.03 240)",
              fontSize: 13,
              lineHeight: 1.6,
              maxWidth: 520,
            }}
          >
            Clique em <strong>Próximo ▶</strong> para ver o prompt nascer — uma
            região do cérebro acende por vez e o texto vai sendo montado aqui,
            na ordem real do motor.
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily:
                "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              lineHeight: 1.6,
              color: "oklch(0.86 0.025 240)",
            }}
          >
            {texto}
          </pre>
        )}
      </div>
    </div>
  );
}

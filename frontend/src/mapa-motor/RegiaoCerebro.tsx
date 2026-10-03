// Uma região do "cérebro" — cluster de neurônios (blocos) que acende junto.
// Estados: apagada (ainda não rodou) · ativa (acendendo agora) · consolidada (já passou).
// Motion sóbrio (emil): glow via box-shadow, transition ease-out ~240ms, sem bounce;
// respeita prefers-reduced-motion.

import { useMemo } from "react";
import type { RegiaoCerebro as TRegiao, BlocosPrompt } from "./tipos-construcao";
import { ROTULO_BLOCO, blocoTemConteudo } from "./regioes-mapa";

export type EstadoRegiao = "apagada" | "ativa" | "consolidada";

interface Props {
  regiao: TRegiao;
  estado: EstadoRegiao;
  blocos: BlocosPrompt | null;
  promptCompleto: string;
  aoClicar: () => void;
}

const reduzMovimento =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function RegiaoCerebro({
  regiao,
  estado,
  blocos,
  promptCompleto,
  aoClicar,
}: Props) {
  const { hue } = regiao;

  const cores = useMemo(() => {
    if (estado === "apagada") {
      return {
        fundo: "oklch(0.16 0.02 240)",
        borda: "oklch(0.26 0.03 240)",
        texto: "oklch(0.48 0.03 240)",
        sombra: "none",
      };
    }
    if (estado === "ativa") {
      return {
        fundo: `oklch(0.30 0.13 ${hue})`,
        borda: `oklch(0.70 0.18 ${hue})`,
        texto: "oklch(0.97 0.02 240)",
        sombra: reduzMovimento
          ? "none"
          : `0 0 0 1px oklch(0.70 0.18 ${hue} / 0.5), 0 0 22px oklch(0.70 0.18 ${hue} / 0.45)`,
      };
    }
    return {
      fundo: `oklch(0.22 0.06 ${hue})`,
      borda: `oklch(0.45 0.10 ${hue})`,
      texto: "oklch(0.88 0.03 240)",
      sombra: "none",
    };
  }, [estado, hue]);

  const chipsBloco = regiao.ehFinal
    ? [
        {
          chave: "final" as const,
          rotulo: "Prompt montado",
          ativo: estado !== "apagada",
          chars: promptCompleto.length,
        },
      ]
    : regiao.chaves.map((ch) => ({
        chave: ch,
        rotulo: ROTULO_BLOCO[ch],
        ativo: blocoTemConteudo(blocos, ch),
        chars: (blocos?.[ch] ?? "").length,
      }));

  return (
    <button
      onClick={aoClicar}
      title={regiao.resumo}
      style={{
        flex: "1 1 0",
        minWidth: 150,
        textAlign: "left",
        background: cores.fundo,
        border: `1.5px solid ${cores.borda}`,
        borderRadius: 12,
        boxShadow: cores.sombra,
        color: cores.texto,
        cursor: "pointer",
        padding: "12px 12px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: reduzMovimento
          ? "none"
          : "background 240ms cubic-bezier(0.23,1,0.32,1), box-shadow 240ms cubic-bezier(0.23,1,0.32,1), border-color 240ms ease-out",
        opacity: estado === "apagada" ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            flexShrink: 0,
            background:
              estado === "apagada"
                ? "oklch(0.40 0.02 240)"
                : `oklch(0.75 0.19 ${hue})`,
            boxShadow:
              estado === "ativa" && !reduzMovimento
                ? `0 0 8px oklch(0.75 0.19 ${hue} / 0.8)`
                : "none",
          }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "-0.01em" }}>
          {regiao.titulo}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {chipsBloco.map((c) => (
          <span
            key={c.chave}
            style={{
              fontSize: 10,
              padding: "2px 7px",
              borderRadius: 999,
              background: c.ativo
                ? `oklch(0.30 0.09 ${hue})`
                : "oklch(0.18 0.015 240)",
              border: `1px solid ${
                c.ativo ? `oklch(0.55 0.13 ${hue})` : "oklch(0.26 0.02 240)"
              }`,
              color: c.ativo ? "oklch(0.93 0.03 240)" : "oklch(0.46 0.02 240)",
              whiteSpace: "nowrap",
            }}
          >
            {c.rotulo}
            {estado !== "apagada" && (
              <span style={{ opacity: 0.6 }}>
                {" "}
                {c.ativo ? `· ${c.chars}` : "· vazio"}
              </span>
            )}
          </span>
        ))}
      </div>
    </button>
  );
}

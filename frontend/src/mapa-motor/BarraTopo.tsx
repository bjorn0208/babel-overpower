// Barra superior do Mapa Motor: título + toggle vista (Grafo/Lab) + toggle replay + legenda
// C3: adicionado toggle "Lab/Gap" para alternar entre grafo e lista ragentic-lab

import { COR_CANAL } from "./layout";
import type { ModoVista } from "./tipos";

interface PropsBarraTopo {
  geradoEm: string;
  modoReplay: boolean;
  onToggleReplay: () => void;
  modoVista: ModoVista;
  onSelecionarVista: (v: ModoVista) => void;
}

export default function BarraTopo({
  geradoEm,
  modoReplay,
  onToggleReplay,
  modoVista,
  onSelecionarVista,
}: PropsBarraTopo) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: "oklch(0.13 0.03 240)",
        borderBottom: "1px solid oklch(0.22 0.03 240)",
        flexShrink: 0,
      }}
    >
      {/* Indicador vivo */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "oklch(0.7 0.18 145)",
          boxShadow: "0 0 6px oklch(0.7 0.18 145 / 0.6)",
        }}
      />
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "oklch(0.95 0.02 240)",
          letterSpacing: "-0.01em",
        }}
      >
        Mapa do Motor Vivo
      </span>
      <span style={{ fontSize: 11, color: "oklch(0.5 0.04 240)", marginLeft: 2 }}>
        ragentic-processar-inline · gerado em {geradoEm}
      </span>

      {/* Controles direita */}
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        {/* Toggle Grafo / Lab */}
        <div
          style={{
            display: "flex",
            background: "oklch(0.17 0.02 240)",
            border: "1px solid oklch(0.28 0.04 240)",
            borderRadius: 7,
            overflow: "hidden",
          }}
        >
          {(["grafo", "construcao", "lab"] as ModoVista[]).map((vista) => (
            <button
              key={vista}
              onClick={() => {
                if (modoVista !== vista) onSelecionarVista(vista);
              }}
              title={
                vista === "lab"
                  ? "Lista completa do ragentic-lab com cruzamento de cobertura"
                  : vista === "construcao"
                  ? "Como o System Prompt é montado, região por região (cérebro)"
                  : "Grafo do motor de hoje"
              }
              style={{
                background:
                  modoVista === vista ? "oklch(0.28 0.08 265)" : "transparent",
                border: "none",
                borderRadius: 0,
                color:
                  modoVista === vista
                    ? "oklch(0.95 0.04 240)"
                    : "oklch(0.55 0.04 240)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 12px",
                transition: "background 150ms ease-out",
              }}
            >
              {vista === "grafo"
                ? "Grafo"
                : vista === "construcao"
                ? "Construção"
                : "Lab / Gap"}
            </button>
          ))}
        </div>

        {/* Toggle replay — só visível no modo grafo */}
        {modoVista === "grafo" && (
          <button
            onClick={onToggleReplay}
            style={{
              background: modoReplay
                ? "oklch(0.55 0.18 145)"
                : "oklch(0.20 0.03 240)",
              border: `1.5px solid ${
                modoReplay ? "oklch(0.55 0.18 145)" : "oklch(0.30 0.04 240)"
              }`,
              borderRadius: 7,
              color: modoReplay ? "oklch(0.97 0.01 240)" : "oklch(0.65 0.04 240)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 12px",
              transition: "background 150ms ease-out",
            }}
          >
            {modoReplay ? "▶ Replay ativo" : "▶ Replay"}
          </button>
        )}

        {/* Legenda de canais — só no modo grafo */}
        {modoVista === "grafo" &&
          (["externo", "interno", "ambos"] as const).map((canal) => (
            <div key={canal} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: COR_CANAL[canal],
                }}
              />
              <span style={{ fontSize: 11, color: "oklch(0.65 0.03 240)" }}>
                {canal === "externo"
                  ? "Conversas"
                  : canal === "interno"
                  ? "Mentor/Admin"
                  : "Ambos"}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

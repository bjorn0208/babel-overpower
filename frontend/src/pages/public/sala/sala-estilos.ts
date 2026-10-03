/**
 * sala-estilos — estilos inline da página pública da sala (pré-join).
 */

import { cor } from "@/apps/user/reuniao/reuniao-ui";

export const s = {
  pagina: {
    minHeight: "100dvh",
    background: cor.fundo,
    display: "flex",
    flexDirection: "column" as const,
    fontFamily: "system-ui, sans-serif",
    color: cor.texto1,
  },
  topo: { padding: "18px 24px", display: "flex", alignItems: "center", gap: 8 },
  marca: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: cor.texto1,
  },
  principal: {
    flex: 1,
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "clamp(20px, 4vw, 48px)",
    padding: "12px 20px 40px",
  },
  colunaPreview: { flex: "1 1 420px", maxWidth: 720, minWidth: 280 },
  colunaPainel: {
    flex: "0 1 360px",
    minWidth: 270,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 16,
    textAlign: "center" as const,
    padding: "8px 4px",
  },
  tituloPainel: {
    fontSize: 22,
    fontWeight: 600,
    margin: 0,
    letterSpacing: "-0.01em",
  },
  subPainel: {
    fontSize: 13.5,
    color: cor.texto2,
    margin: 0,
    lineHeight: 1.5,
  },
  erro: {
    fontSize: 13,
    color: "oklch(0.78 0.14 25)",
    padding: "10px 14px",
    background: "oklch(0.18 0.06 25 / 0.3)",
    borderRadius: 10,
    border: "1px solid oklch(0.4 0.1 25 / 0.4)",
    width: "100%",
    boxSizing: "border-box" as const,
  },
} as const;

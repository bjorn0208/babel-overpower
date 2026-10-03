/**
 * reuniao-ui — base visual compartilhada do app Reunião (estilo Google Meet).
 *
 * Tokens de cor, classes CSS injetadas (hover/active/focus), avatar com
 * inicial colorida e botão circular de controle. Usado pelo lobby,
 * pela tela da chamada e pela página pública da sala.
 */

import type { CSSProperties, ReactNode } from "react";

// ─── Tokens ──────────────────────────────────────────────────────────────────

export const cor = {
  fundo: "oklch(0.11 0.025 264)",
  fundoChamada: "oklch(0.13 0.02 264)",
  tile: "oklch(0.17 0.028 264)",
  superficie: "oklch(0.16 0.03 264 / 0.8)",
  borda: "oklch(0.3 0.05 264 / 0.45)",
  texto1: "oklch(0.93 0.015 264)",
  texto2: "oklch(0.68 0.03 264)",
  texto3: "oklch(0.55 0.03 264)",
  primario: "oklch(0.55 0.17 250)",
  primarioHover: "oklch(0.6 0.17 250)",
  perigo: "oklch(0.55 0.2 25)",
  perigoHover: "oklch(0.6 0.2 25)",
  vivo: "oklch(0.72 0.17 150)",
} as const;

// ─── Paleta de avatar (hash do nome → cor estável) ───────────────────────────

const HUES_AVATAR = [250, 150, 25, 300, 80, 200, 340, 110];

export function corDoNome(nome: string): string {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) | 0;
  const hue = HUES_AVATAR[Math.abs(hash) % HUES_AVATAR.length];
  return `oklch(0.5 0.12 ${hue})`;
}

export function inicialDoNome(nome: string): string {
  return (nome.trim().charAt(0) || "?").toUpperCase();
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

export function Avatar({ nome, tamanho = 40 }: { nome: string; tamanho?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: "50%",
        background: corDoNome(nome),
        color: "oklch(0.97 0.01 264)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: tamanho * 0.42,
        fontWeight: 600,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {inicialDoNome(nome)}
    </div>
  );
}

// ─── Botão circular de controle (estilo Meet) ────────────────────────────────

export function BotaoRedondo({
  rotulo,
  desligado,
  onClick,
  children,
  tamanho = 50,
}: {
  rotulo: string;
  /** Estado "off" (mic mudo, câmera desligada) — fica vermelho como no Meet. */
  desligado?: boolean;
  onClick: () => void;
  children: ReactNode;
  tamanho?: number;
}) {
  return (
    <button
      type="button"
      className={desligado ? "reu-btn reu-redondo reu-redondo-off" : "reu-btn reu-redondo"}
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={desligado ?? false}
      style={{ width: tamanho, height: tamanho }}
    >
      {children}
    </button>
  );
}

// ─── Estilos base reutilizáveis (inline) ─────────────────────────────────────

export const estiloInput: CSSProperties = {
  background: "oklch(0.17 0.03 264)",
  border: "1px solid oklch(0.32 0.05 264 / 0.55)",
  borderRadius: 10,
  padding: "11px 14px",
  color: cor.texto1,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

// ─── Folha de estilo injetada (estados que inline style não cobre) ───────────

const CSS_REUNIAO = `
.reu-btn {
  cursor: pointer;
  border: none;
  font-family: inherit;
  transition: background 150ms ease-out, transform 160ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease-out;
}
.reu-btn:active { transform: scale(0.96); }
.reu-btn:disabled { opacity: 0.55; cursor: default; }
.reu-btn:focus-visible, .reu-input:focus-visible {
  outline: 2px solid ${cor.primario};
  outline-offset: 2px;
}
.reu-btn-primario {
  background: ${cor.primario};
  color: oklch(0.98 0.005 264);
  border-radius: 999px;
  font-weight: 600;
  font-size: 14px;
  padding: 11px 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.reu-btn-secundario {
  background: oklch(0.22 0.04 264 / 0.7);
  border: 1px solid oklch(0.34 0.05 264 / 0.5);
  color: ${cor.texto1};
  border-radius: 999px;
  font-weight: 600;
  font-size: 13.5px;
  padding: 10px 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.reu-btn-fantasma {
  background: transparent;
  border: none;
  color: ${cor.texto2};
  border-radius: 999px;
  padding: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.reu-redondo {
  background: oklch(0.24 0.04 264 / 0.85);
  color: ${cor.texto1};
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.reu-redondo-off { background: ${cor.perigo}; color: oklch(0.98 0.005 25); }
.reu-pill-perigo {
  background: ${cor.perigo};
  color: oklch(0.98 0.005 25);
  border-radius: 999px;
  padding: 0 26px;
  height: 50px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.reu-card { transition: background 150ms ease-out, border-color 150ms ease-out; }
@media (hover: hover) and (pointer: fine) {
  .reu-btn-primario:hover:not(:disabled) { background: ${cor.primarioHover}; }
  .reu-btn-secundario:hover:not(:disabled) { background: oklch(0.27 0.045 264 / 0.8); }
  .reu-btn-fantasma:hover:not(:disabled) { background: oklch(0.24 0.04 264 / 0.6); color: ${cor.texto1}; }
  .reu-redondo:hover:not(:disabled):not(.reu-redondo-off) { background: oklch(0.3 0.05 264 / 0.9); }
  .reu-redondo-off:hover:not(:disabled) { background: ${cor.perigoHover}; }
  .reu-pill-perigo:hover:not(:disabled) { background: ${cor.perigoHover}; }
  .reu-card:hover { background: oklch(0.19 0.035 264 / 0.85); border-color: oklch(0.36 0.05 264 / 0.55); }
}
@keyframes reu-pulso {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
}
@keyframes reu-surgir {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes reu-brilho {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
.reu-surgir { animation: reu-surgir 240ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.reu-skeleton {
  background: linear-gradient(90deg, oklch(0.17 0.03 264) 25%, oklch(0.21 0.035 264) 50%, oklch(0.17 0.03 264) 75%);
  background-size: 200% 100%;
  animation: reu-brilho 1.6s linear infinite;
  border-radius: 12px;
}
@media (prefers-reduced-motion: reduce) {
  .reu-surgir { animation-duration: 1ms; }
  .reu-skeleton { animation: none; }
  .reu-btn { transition: none; }
}
`;

/** Injeta a folha de estilo do app Reunião uma única vez por página. */
export function EstiloReuniao() {
  return <style>{CSS_REUNIAO}</style>;
}

/**
 * Estilos do calendário mensal da página pública de agendamento.
 * Mesma família visual dos links públicos (variáveis --pp-* já injetadas por
 * injetarEstilosGlobais). Aqui só entram as classes específicas do calendário.
 */

/** Injeta o CSS do calendário (classes .pp-cal-*, .pp-slot*) no <head> */
export function injetarEstilosAgenda(): void {
  if (document.getElementById("pp-agenda-styles")) return;
  const el = document.createElement("style");
  el.id = "pp-agenda-styles";
  el.textContent = `
.pp-cal { user-select: none; }
.pp-cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.pp-cal-title { font-size: 17px; font-weight: 700; color: var(--pp-ink); text-transform: capitalize; letter-spacing: -0.01em; }
.pp-cal-nav { display: flex; gap: 8px; }
.pp-cal-arrow { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--pp-paper); border: 1px solid var(--pp-border); color: var(--pp-ink-2); cursor: pointer; transition: background 160ms ease, transform 100ms ease, border-color 160ms ease; }
.pp-cal-arrow:hover:not(:disabled) { background: var(--pp-bg-2); border-color: var(--pp-border-2); }
.pp-cal-arrow:active:not(:disabled) { transform: scale(0.92); }
.pp-cal-arrow:disabled { opacity: 0.32; cursor: not-allowed; }
.pp-cal-dow { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 6px; }
.pp-cal-dow span { text-align: center; font-size: 11px; font-weight: 600; color: var(--pp-ink-4); text-transform: uppercase; letter-spacing: 0.03em; }
.pp-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.pp-cal-cell { position: relative; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; border-radius: var(--pp-r-sm); border: 1px solid transparent; color: var(--pp-ink-4); background: transparent; cursor: default; transition: background 180ms cubic-bezier(0.16, 1, 0.3, 1), color 160ms ease, transform 120ms ease, border-color 160ms ease; }
.pp-cal-cell.has-slots { color: var(--pp-ink); background: var(--pp-acc-soft); border-color: oklch(0.55 0.18 295 / 0.18); cursor: pointer; }
.pp-cal-cell.has-slots:hover { background: oklch(0.55 0.18 295 / 0.16); transform: translateY(-1px); }
.pp-cal-cell.has-slots:active { transform: scale(0.95); }
.pp-cal-cell.is-today:not(.is-selected) { border-color: var(--pp-acc); }
.pp-cal-cell.is-selected { background: linear-gradient(135deg, var(--pp-acc), oklch(0.50 0.18 285)); color: #fff; border-color: transparent; box-shadow: 0 6px 18px oklch(0.55 0.18 295 / 0.30); }
.pp-cal-cell.is-disabled { color: var(--pp-ink-4); opacity: 0.38; }
.pp-cal-empty { visibility: hidden; }
.pp-cal-dot { position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: var(--pp-acc); }
.pp-cal-cell.is-selected .pp-cal-dot { background: #fff; }
.pp-cal-legend { display: flex; align-items: center; gap: 6px; margin-top: 14px; font-size: 11.5px; color: var(--pp-ink-4); }
.pp-cal-legend i { width: 10px; height: 10px; border-radius: 3px; background: var(--pp-acc-soft); border: 1px solid oklch(0.55 0.18 295 / 0.25); display: inline-block; }
@media (min-width: 760px) {
  .pp-agendar-2col { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 32px; align-items: start; }
}
.pp-dia-head { font-size: 13px; font-weight: 700; color: var(--pp-ink-2); text-transform: capitalize; margin: 0 0 12px; }
.pp-slots { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.pp-slot { min-width: 74px; min-height: 42px; padding: 8px 14px; border-radius: var(--pp-r); font-size: 14px; font-weight: 600; border: 1px solid var(--pp-border); background: var(--pp-paper); color: var(--pp-ink-2); cursor: pointer; font-family: var(--pp-font-ui); transition: border-color 140ms ease, color 140ms ease, transform 100ms ease, background 140ms ease; }
.pp-slot:hover { border-color: var(--pp-acc); color: var(--pp-ink); }
.pp-slot.is-on { background: linear-gradient(135deg, var(--pp-acc), oklch(0.50 0.18 285)); color: #fff; border-color: transparent; box-shadow: 0 4px 14px oklch(0.55 0.18 295 / 0.28); }
.pp-slot:active { transform: scale(0.96); }
.pp-dia-vazio { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 16px; color: var(--pp-ink-4); font-size: 14px; gap: 10px; }
`;
  document.head.appendChild(el);
}

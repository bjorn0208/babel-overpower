/**
 * Design system tokens e estilos CSS-in-JS para a página pública de contrato.
 * Reproduz fielmente pp-styles.css do bundle Claude design.
 */

/** Injeta o CSS do design system (variáveis --pp-*) no <head> */
export function injetarEstilosGlobais(): void {
  if (document.getElementById("pp-styles")) return;
  const el = document.createElement("style");
  el.id = "pp-styles";
  el.textContent = `
:root {
  --pp-bg: oklch(0.985 0.005 90);
  --pp-bg-2: oklch(0.97 0.006 80);
  --pp-paper: oklch(1 0 0);
  --pp-ink: oklch(0.18 0.015 270);
  --pp-ink-2: oklch(0.36 0.018 270);
  --pp-ink-3: oklch(0.52 0.014 270);
  --pp-ink-4: oklch(0.68 0.010 270);
  --pp-border: oklch(0.90 0.005 270);
  --pp-border-2: oklch(0.86 0.006 270);
  --pp-acc: oklch(0.55 0.18 295);
  --pp-acc-2: oklch(0.62 0.16 235);
  --pp-acc-soft: oklch(0.55 0.18 295 / 0.10);
  --pp-acc-soft-2: oklch(0.62 0.16 235 / 0.10);
  --pp-success: oklch(0.55 0.16 150);
  --pp-success-soft: oklch(0.55 0.16 150 / 0.10);
  --pp-warn: oklch(0.55 0.16 80);
  --pp-warn-soft: oklch(0.55 0.16 80 / 0.10);
  --pp-rose: oklch(0.55 0.20 20);
  --pp-font-ui: "Geist", "Inter Tight", -apple-system, system-ui, sans-serif;
  --pp-font-doc: "Source Serif 4", "Newsreader", Georgia, serif;
  --pp-font-mono: "Geist Mono", ui-monospace, monospace;
  --pp-sh-sm: 0 1px 2px oklch(0 0 0 / 0.04);
  --pp-sh: 0 1px 3px oklch(0 0 0 / 0.04), 0 8px 24px oklch(0 0 0 / 0.04);
  --pp-sh-lg: 0 2px 8px oklch(0 0 0 / 0.05), 0 24px 60px oklch(0 0 0 / 0.08);
  --pp-r-sm: 8px; --pp-r: 12px; --pp-r-lg: 18px; --pp-r-xl: 24px;
}
* { box-sizing: border-box; }
.pp-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.pp-bg::before, .pp-bg::after { content: ""; position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.5; }
.pp-bg::before { width: 60vw; height: 60vw; top: -25vw; right: -15vw; background: radial-gradient(circle, oklch(0.72 0.16 235 / 0.16), transparent 70%); }
.pp-bg::after { width: 70vw; height: 70vw; bottom: -30vw; left: -20vw; background: radial-gradient(circle, oklch(0.72 0.18 295 / 0.12), transparent 70%); }
.pp-app { position: relative; z-index: 1; height: 100vh; height: 100dvh; overflow-y: auto; display: flex; flex-direction: column; font-family: var(--pp-font-ui); font-size: 15px; line-height: 1.55; letter-spacing: -0.005em; color: var(--pp-ink); background: var(--pp-bg); -webkit-font-smoothing: antialiased; }
.pp-header { position: sticky; top: 0; z-index: 10; background: oklch(1 0 0 / 0.78); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid var(--pp-border); display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; }
.pp-brand { display: flex; align-items: center; gap: 10px; }
.pp-logo { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, var(--pp-acc), var(--pp-acc-2)); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px oklch(0.55 0.18 295 / 0.25); }
.pp-brand-text { line-height: 1.2; }
.pp-brand-eyebrow { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--pp-ink-4); }
.pp-brand-name { font-size: 14px; font-weight: 700; color: var(--pp-ink); }
.pp-seguro { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--pp-ink-3); font-weight: 500; }
.pp-main { flex: 1; display: block; position: relative; max-width: 720px; margin: 0 auto; width: 100%; padding: 28px 20px 60px; }
@media (min-width: 760px) { .pp-main { max-width: 880px; padding: 56px 40px 100px; } }
.pp-card { background: var(--pp-paper); border: 1px solid var(--pp-border); border-radius: var(--pp-r-lg); padding: 28px 24px; box-shadow: var(--pp-sh); }
@media (min-width: 760px) { .pp-card { padding: 44px 56px; border-radius: var(--pp-r-xl); box-shadow: var(--pp-sh-lg); } }
.pp-progress { margin-bottom: 24px; }
.pp-progress-bars { display: flex; gap: 4px; margin-bottom: 8px; }
.pp-progress-bar { flex: 1; height: 3px; border-radius: 99px; background: var(--pp-border); transition: background 360ms cubic-bezier(0.16, 1, 0.3, 1); }
.pp-progress-bar.is-done { background: var(--pp-acc); opacity: 0.55; }
.pp-progress-bar.is-current { background: var(--pp-acc); }
.pp-progress-meta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--pp-ink-4); }
.pp-progress-meta b { color: var(--pp-ink-2); font-weight: 600; }
.pp-step-icon { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, var(--pp-acc-soft), var(--pp-acc-soft-2)); color: var(--pp-acc); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
@media (min-width: 760px) { .pp-step-icon { width: 56px; height: 56px; margin-bottom: 20px; } }
.pp-step-title { font-size: 26px; font-weight: 700; line-height: 1.15; letter-spacing: -0.025em; color: var(--pp-ink); margin: 0 0 8px; }
@media (min-width: 760px) { .pp-step-title { font-size: 32px; } }
.pp-step-sub { font-size: 15px; color: var(--pp-ink-3); margin: 0 0 26px; line-height: 1.55; }
@media (min-width: 760px) { .pp-step-sub { font-size: 16px; margin-bottom: 32px; } }
.pp-field { margin-bottom: 14px; }
.pp-label { display: block; font-size: 11px; font-weight: 600; color: var(--pp-ink-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; }
.pp-req { color: var(--pp-rose); margin-left: 3px; }
.pp-input { width: 100%; padding: 12px 14px; font-size: 15px; color: var(--pp-ink); background: var(--pp-paper); border: 1px solid var(--pp-border); border-radius: var(--pp-r); outline: none; transition: border-color 160ms ease, box-shadow 160ms ease; }
.pp-input:focus { border-color: var(--pp-acc); box-shadow: 0 0 0 4px oklch(0.55 0.18 295 / 0.12); }
.pp-input::placeholder { color: var(--pp-ink-4); }
.pp-seg { display: inline-flex; gap: 4px; padding: 3px; margin-bottom: 8px; background: var(--pp-bg-2); border: 1px solid var(--pp-border); border-radius: 99px; }
.pp-seg-btn { padding: 6px 16px; font-size: 13px; font-weight: 600; color: var(--pp-ink-3); background: transparent; border: none; border-radius: 99px; cursor: pointer; font-family: var(--pp-font-ui); transition: background 160ms ease, color 160ms ease; }
.pp-seg-btn.is-on { background: var(--pp-paper); color: var(--pp-acc); box-shadow: var(--pp-sh-sm); }
.pp-erro-campo { font-size: 12px; color: var(--pp-rose); margin-top: 5px; }
.pp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 22px; font-size: 14px; font-weight: 600; border-radius: var(--pp-r); cursor: pointer; border: 1px solid transparent; transition: filter 160ms ease, transform 100ms ease; font-family: var(--pp-font-ui); }
.pp-btn:active { transform: scale(0.98); }
.pp-btn-primary { background: linear-gradient(135deg, var(--pp-acc), oklch(0.50 0.18 285)); color: white; box-shadow: 0 6px 22px oklch(0.55 0.18 295 / 0.30); }
.pp-btn-primary:hover { filter: brightness(1.05); }
.pp-btn-primary:disabled { background: var(--pp-border-2); color: var(--pp-ink-4); box-shadow: none; cursor: not-allowed; }
.pp-btn-ghost { background: transparent; color: var(--pp-ink-3); border-color: var(--pp-border); }
.pp-btn-ghost:hover { background: var(--pp-bg-2); }
.pp-btn-block { width: 100%; }
.pp-actions { display: flex; gap: 10px; margin-top: 8px; }
.pp-actions .pp-btn-primary { flex: 1; }
.pp-doc-open { background: var(--pp-paper); border: 1px solid var(--pp-border); border-radius: var(--pp-r-lg); padding: 32px 28px; font-family: var(--pp-font-doc); font-size: 14.5px; line-height: 1.75; color: var(--pp-ink); box-shadow: var(--pp-sh); margin-top: 20px; }
@media (min-width: 760px) { .pp-doc-open { padding: 56px 64px; font-size: 15.5px; border-radius: var(--pp-r-xl); box-shadow: var(--pp-sh-lg); } }
.pp-doc-open h1 { font-family: var(--pp-font-doc); font-size: 26px; font-weight: 700; text-align: center; margin: 0 0 24px; letter-spacing: -0.015em; color: var(--pp-ink); }
.pp-doc-open h2 { font-family: var(--pp-font-doc); font-size: 18px; font-weight: 700; margin: 28px 0 10px; color: var(--pp-ink); }
.pp-doc-open h3 { font-family: var(--pp-font-doc); font-size: 15px; font-weight: 700; margin: 22px 0 8px; color: var(--pp-ink-2); }
.pp-doc-open p { margin: 0 0 0.95em; }
.pp-doc-open strong { color: var(--pp-ink); font-weight: 700; }
.pp-doc-header { text-align: center; margin-bottom: 8px; }
.pp-doc-header .pp-step-icon { margin: 0 auto 16px; }
.pp-doc-header .pp-step-title { margin-bottom: 6px; }
.pp-pay-card { border: 1px solid var(--pp-border); border-radius: var(--pp-r); background: var(--pp-paper); padding: 16px 18px; margin-bottom: 10px; cursor: pointer; display: flex; gap: 14px; transition: border-color 160ms ease, background 160ms ease; }
.pp-pay-card:hover { border-color: var(--pp-border-2); }
.pp-pay-card.is-on { border-color: var(--pp-acc); background: linear-gradient(135deg, var(--pp-acc-soft), transparent); box-shadow: 0 0 0 4px oklch(0.55 0.18 295 / 0.08); }
.pp-pay-radio { width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; border: 2px solid var(--pp-border-2); margin-top: 2px; transition: all 160ms ease; }
.pp-pay-card.is-on .pp-pay-radio { border-color: var(--pp-acc); background: var(--pp-acc); box-shadow: inset 0 0 0 4px var(--pp-paper); }
.pp-pay-title { font-size: 15px; font-weight: 700; color: var(--pp-ink); }
.pp-pay-num { font-family: var(--pp-font-mono); font-weight: 700; color: var(--pp-ink); }
.pp-pay-detail { font-size: 13px; color: var(--pp-ink-3); margin-top: 4px; }
.pp-pay-econ { margin-top: 6px; display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: var(--pp-success-soft); color: var(--pp-success); }
.pp-pay-select { width: 100%; margin-top: 8px; padding: 9px 12px; font-size: 13.5px; background: var(--pp-paper); border: 1px solid var(--pp-border); border-radius: 8px; color: var(--pp-ink); font-family: var(--pp-font-ui); }
.pp-upload { display: block; width: 100%; border: 2px dashed var(--pp-border-2); background: var(--pp-bg-2); border-radius: var(--pp-r); padding: 28px 18px; text-align: center; cursor: pointer; transition: all 200ms ease; }
.pp-upload:hover { border-color: var(--pp-acc); background: var(--pp-acc-soft); }
.pp-upload.has-file { border-style: solid; border-color: var(--pp-acc); background: var(--pp-acc-soft); padding: 14px; }
.pp-upload-icon { width: 56px; height: 56px; margin: 0 auto 10px; border-radius: 16px; background: var(--pp-paper); border: 1px solid var(--pp-border); display: flex; align-items: center; justify-content: center; color: var(--pp-acc); }
.pp-upload-label { font-size: 14px; font-weight: 600; color: var(--pp-ink); margin-bottom: 4px; }
.pp-upload-hint { font-size: 11.5px; color: var(--pp-ink-4); }
.pp-upload-preview img { width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; }
.pp-upload-trade { color: var(--pp-acc); font-size: 12px; font-weight: 600; }
.pp-camera-frame { position: relative; width: 100%; aspect-ratio: 3/4; max-height: 480px; border-radius: var(--pp-r-lg); overflow: hidden; background: oklch(0.12 0.01 270); margin-bottom: 14px; border: 1px solid var(--pp-border); box-shadow: var(--pp-sh); }
.pp-camera-video { display: block; width: 100%; height: 100%; object-fit: cover; background: oklch(0.12 0.01 270); }
.pp-camera-status { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: oklch(0.85 0.005 270); text-align: center; padding: 20px; }
.pp-camera-spinner { width: 36px; height: 36px; border-radius: 50%; border: 3px solid oklch(1 0 0 / 0.15); border-top-color: var(--pp-acc); animation: ppSpin 800ms linear infinite; }
@keyframes ppSpin { to { transform: rotate(360deg); } }
.pp-camera-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.pp-camera-oval { width: 60%; aspect-ratio: 3/4; border: 2px dashed oklch(1 0 0 / 0.55); border-radius: 50%; box-shadow: 0 0 0 9999px oklch(0 0 0 / 0.20); }
.pp-shutter { display: flex; align-items: center; justify-content: center; width: 76px; height: 76px; margin: 0 auto; border-radius: 50%; background: transparent; border: 4px solid var(--pp-acc); cursor: pointer; transition: transform 100ms ease; }
.pp-shutter:hover { transform: scale(1.05); }
.pp-shutter:active { transform: scale(0.95); }
.pp-shutter-inner { width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, var(--pp-acc), oklch(0.50 0.18 285)); box-shadow: 0 4px 14px oklch(0.55 0.18 295 / 0.4); }
.pp-canvas-wrap { position: relative; border-radius: var(--pp-r); background: var(--pp-paper); border: 1px solid var(--pp-border); margin-bottom: 8px; overflow: hidden; }
.pp-canvas { display: block; width: 100%; height: 200px; touch-action: none; cursor: crosshair; }
.pp-canvas-hint { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); font-size: 12px; color: var(--pp-ink-4); pointer-events: none; font-style: italic; display: flex; align-items: center; gap: 6px; }
.pp-canvas-line { position: absolute; left: 10%; right: 10%; bottom: 38px; height: 1px; background: var(--pp-border-2); pointer-events: none; }
.pp-canvas-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.pp-link { font-size: 12.5px; color: var(--pp-acc); font-weight: 600; background: transparent; border: none; cursor: pointer; padding: 4px 8px; font-family: var(--pp-font-ui); }
.pp-link:hover { text-decoration: underline; }
.pp-pix-card { padding: 18px; background: linear-gradient(135deg, var(--pp-acc-soft), var(--pp-acc-soft-2)); border: 1px solid oklch(0.55 0.18 295 / 0.25); border-radius: var(--pp-r); margin-bottom: 14px; }
.pp-pix-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--pp-ink-4); margin-bottom: 4px; }
.pp-pix-valor { font-family: var(--pp-font-mono); font-weight: 700; font-size: 24px; color: var(--pp-ink); margin-bottom: 12px; letter-spacing: -0.01em; }
.pp-pix-key { font-family: var(--pp-font-mono); font-size: 14px; background: var(--pp-paper); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--pp-border); display: flex; align-items: center; justify-content: space-between; word-break: break-all; }
.pp-done { text-align: center; padding: 30px 10px 20px; }
.pp-done-check { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, var(--pp-acc), var(--pp-acc-2)); display: flex; align-items: center; justify-content: center; margin: 0 auto 22px; color: white; box-shadow: 0 12px 40px oklch(0.55 0.18 295 / 0.35); animation: ppCheckIn 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes ppCheckIn { from { transform: scale(0); } to { transform: scale(1); } }
.pp-done-title { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; }
.pp-done-text { font-size: 15px; color: var(--pp-ink-3); margin: 0 auto 24px; max-width: 360px; }
.pp-fade { animation: ppFade 320ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes ppFade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.pp-footer { padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--pp-ink-4); border-top: 1px solid var(--pp-border); margin-top: 32px; }
.pp-footer-trust { display: flex; gap: 10px; align-items: center; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: oklch(0.85 0.005 270); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background: oklch(0.75 0.005 270); background-clip: padding-box; }
`;
  document.head.appendChild(el);
}

// Explosão de confete em canvas puro — usada na oferta da mentoria.
// Cores da celebração cravadas pelo Theus: roxo, dourado, vermelho, azul.
const CORES = ["#8b5cf6", "#d9a83f", "#ff4d5a", "#4fa8e8", "#c4b5fd", "#f0d48a"];

export function explodirConfete(duracaoMs = 2600) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:none";
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }

  type Papel = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; cor: string; w: number; h: number };
  const papeis: Papel[] = Array.from({ length: 160 }, () => {
    const angulo = Math.random() * Math.PI * 2;
    const forca = 6 + Math.random() * 13;
    return {
      x: innerWidth / 2 + (Math.random() - 0.5) * 220,
      y: innerHeight * 0.4,
      vx: Math.cos(angulo) * forca,
      vy: Math.sin(angulo) * forca - 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      cor: CORES[Math.floor(Math.random() * CORES.length)],
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 5,
    };
  });

  const inicio = performance.now();
  function quadro(agora: number) {
    const t = agora - inicio;
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of papeis) {
      p.vy += 0.22;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - t / duracaoMs);
      ctx.fillStyle = p.cor;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < duracaoMs) requestAnimationFrame(quadro);
    else canvas.remove();
  }
  requestAnimationFrame(quadro);
}

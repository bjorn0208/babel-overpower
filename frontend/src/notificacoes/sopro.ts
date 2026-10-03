/**
 * Efeito "Sopro" — toast flutuante de notificação (partículas + card).
 *
 * Base: protótipo aprovado (agent-output/drafts/prototipo-notif-3-efeitos-2026-05-18.html).
 * O motor de partículas (`emitir`/`condensar`/`glowBurst` + 7 variações) é fiel ao protótipo.
 *
 * 2026-05-25 (Theus): card alinhado ao card do drawer — foto do WhatsApp do contato
 * (fallback inicial colorida por nome) + badge WhatsApp, inicial do NOME (era da mensagem),
 * sem o "Agente" fixo, tipografia maior. Mídia sem texto vira o rótulo do tipo.
 *
 * Vanilla WAAPI. Decorativo: falha engolida. Respeita reduced-motion.
 */
const EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";

let stylesInjetados = false;
function injetarStyles(): void {
  if (stylesInjetados || document.getElementById("sopro-styles")) {
    stylesInjetados = true;
    return;
  }
  const st = document.createElement("style");
  st.id = "sopro-styles";
  st.textContent = `
.sopro-particula{position:fixed;z-index:240;border-radius:50%;
  background:var(--os-acento-1);box-shadow:0 0 8px var(--os-acento-1);
  pointer-events:none;}
.sopro-stack{position:fixed;top:56px;right:16px;width:340px;height:0;z-index:160;}
.sopro-stack .sopro-card{position:absolute;top:0;right:0;width:336px;
  display:flex;gap:13px;align-items:flex-start;padding:14px 16px;
  background:var(--os-vidro-forte,rgba(255,255,255,0.08));
  border:1px solid var(--os-vidro-borda-forte,rgba(255,255,255,0.18));
  border-radius:18px;backdrop-filter:blur(20px) saturate(180%);
  -webkit-backdrop-filter:blur(20px) saturate(180%);
  box-shadow:0 16px 48px oklch(0.10 0.04 264 / 0.55);
  cursor:pointer;transform-origin:top right;
  transition:transform 460ms ${EXPO},opacity 460ms ${EXPO},filter 460ms ${EXPO};}
.sopro-card .sopro-av-wrap{position:relative;flex:0 0 auto;}
.sopro-card .sopro-av{width:44px;height:44px;border-radius:50%;overflow:hidden;
  display:flex;align-items:center;justify-content:center;
  font-size:15px;font-weight:650;letter-spacing:0.02em;color:oklch(0.99 0.01 264);
  box-shadow:0 2px 8px oklch(0.02 0.02 264 / 0.35),inset 0 0 0 1px oklch(0.98 0 0 / 0.08);}
.sopro-card .sopro-av img{width:100%;height:100%;object-fit:cover;display:block;}
.sopro-card .sopro-av-badge{position:absolute;right:-2px;bottom:-2px;
  width:18px;height:18px;border-radius:50%;display:flex;align-items:center;
  justify-content:center;background:oklch(0.72 0.17 155);
  border:2.5px solid oklch(0.16 0.04 264);
  box-shadow:0 1px 3px oklch(0.02 0.02 264 / 0.5);}
.sopro-card .sopro-col{display:flex;flex-direction:column;gap:3px;min-width:0;padding-top:1px;}
.sopro-card .sopro-titulo{font-size:14px;font-weight:650;line-height:1.3;
  color:var(--txt-1,#fff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sopro-card .sopro-sub{font-size:12.5px;line-height:1.4;
  color:var(--txt-2,rgba(255,255,255,0.7));
  display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden;}`;
  document.head.appendChild(st);
  stylesInjetados = true;
}

function novo(tag: string, cls?: string, txt?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

const ALVO = () => ({ x: window.innerWidth - 176, y: 96 });

type Dados = { ini: string; nome: string; msg: string; foto?: string | null; midiaTipo?: string | null };

let stackEl: HTMLElement | null = null;
let notifs: HTMLElement[] = [];
let barra: DOMRect | null = null;
let vi = 0;

const LABEL_MIDIA: Record<string, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
};

const SVG_WHATSAPP =
  '<svg viewBox="0 0 24 24" width="10" height="10" fill="#fff" aria-hidden="true"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01a1.09 1.09 0 0 0-.792.372c-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>';

function hueNome(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function gradNome(nome: string): string {
  const h = hueNome(nome || "?");
  return `linear-gradient(150deg, oklch(0.55 0.13 ${h}), oklch(0.42 0.11 ${(h + 40) % 360}))`;
}

function montarAvatar(d: Dados): HTMLElement {
  const wrap = novo("div", "sopro-av-wrap");
  const av = novo("div", "sopro-av");
  if (d.foto) {
    const img = document.createElement("img");
    img.src = d.foto;
    img.alt = "";
    img.onerror = () => {
      img.remove();
      av.textContent = d.ini;
      av.style.background = gradNome(d.nome);
    };
    av.appendChild(img);
  } else {
    av.textContent = d.ini;
    av.style.background = gradNome(d.nome);
  }
  const badge = novo("span", "sopro-av-badge");
  badge.innerHTML = SVG_WHATSAPP;
  wrap.appendChild(av);
  wrap.appendChild(badge);
  return wrap;
}

function garantirStack(): HTMLElement {
  if (stackEl && document.body.contains(stackEl)) return stackEl;
  stackEl = novo("div", "sopro-stack");
  stackEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(stackEl);
  return stackEl;
}

function arenaEl(): HTMLElement | null {
  const arena = document.querySelector(".cmd-arena") as HTMLElement | null;
  if (!arena) return null;
  return (arena.querySelector(".cmd-shell") as HTMLElement | null) ?? arena;
}

function medirBarra(): boolean {
  const el = arenaEl();
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 80 || r.height < 8) return false;
  barra = r;
  return true;
}

function glowBurst(forte: boolean): void {
  const arena = document.querySelector(".cmd-arena") as HTMLElement | null;
  arena?.animate(
    [
      { transform: "translateX(-50%) scale(1)" },
      { transform: `translateX(-50%) scale(${forte ? 1.03 : 1.018})` },
      { transform: "translateX(-50%) scale(1)" },
    ],
    { duration: forte ? 340 : 280, easing: EXPO },
  );
}

function relayout(): void {
  notifs.forEach((c, i) => {
    const k = Math.min(i, 3);
    c.style.transform = `translateY(${k * 12}px) scale(${1 - k * 0.045})`;
    c.style.opacity = String(i === 0 ? 1 : i === 1 ? 0.7 : i === 2 ? 0.4 : 0);
    c.style.pointerEvents = i === 0 ? "auto" : "none";
    c.style.zIndex = String(100 - i);
  });
}

function dismiss(card: HTMLElement): void {
  if (!notifs.includes(card)) return;
  notifs = notifs.filter((c) => c !== card);
  card.style.opacity = "0";
  card.style.transform = `${card.style.transform} translateX(28px)`;
  window.setTimeout(() => card.remove(), 420);
  relayout();
}

function pushNotif(d: Dados): void {
  const stack = garantirStack();
  const card = novo("div", "sopro-card");
  const col = novo("div", "sopro-col");
  col.appendChild(novo("span", "sopro-titulo", d.nome));
  const ehPlaceholder = !!d.msg && /^\[[A-Z_]+\]$/.test(d.msg.trim());
  const texto = ehPlaceholder ? "" : d.msg;
  const sub =
    texto ||
    (d.midiaTipo ? LABEL_MIDIA[d.midiaTipo] ?? "Anexo" : ehPlaceholder ? "Mídia recebida" : "");
  if (sub) col.appendChild(novo("span", "sopro-sub", sub));
  card.appendChild(montarAvatar(d));
  card.appendChild(col);
  card.style.opacity = "0";
  card.style.filter = "blur(14px)";
  card.style.transform = "translateY(0) scale(0.5)";
  stack.appendChild(card);
  notifs.unshift(card);
  void card.offsetWidth; // reflow p/ a transição valer
  card.style.filter = "blur(0)";
  relayout();
  window.setTimeout(() => dismiss(card), 6500);
}

function emitir(n: number, dur: number, espalha: number, passo: number, modo?: "extremos"): void {
  const r = barra ?? arenaEl()?.getBoundingClientRect();
  if (!r) return;
  const y0 = r.top + 4;
  const xMin = r.left + 14;
  const xMax = r.left + r.width - 14;
  const a = ALVO();
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    const x0 = modo === "extremos" ? (i % 2 ? xMax : xMin) : xMin + t * (xMax - xMin);
    const p = novo("div", "sopro-particula");
    p.setAttribute("aria-hidden", "true");
    const sz = 4 + Math.random() * 4;
    p.style.width = `${sz}px`;
    p.style.height = `${sz}px`;
    document.body.appendChild(p);
    const midX = (x0 + a.x) / 2 + (Math.random() * espalha - espalha / 2);
    p.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 0.9 },
        { transform: `translate(${midX}px, ${(y0 + a.y) / 2}px) scale(0.8)`, opacity: 0.6, offset: 0.55 },
        { transform: `translate(${a.x + (Math.random() * 16 - 8)}px, ${a.y}px) scale(0.12)`, opacity: 0 },
      ],
      { duration: dur + Math.random() * 160, delay: i * passo, easing: EXPO, fill: "forwards" },
    ).finished.then(() => p.remove()).catch(() => p.remove());
  }
}

function condensar(d: Dados): void {
  const a = ALVO();
  const f = novo("div");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText =
    `position:fixed;z-index:159;left:${a.x - 7}px;top:${a.y - 7}px;` +
    `width:14px;height:14px;border-radius:50%;pointer-events:none;` +
    `background:var(--os-acento-1);box-shadow:0 0 28px var(--os-acento-1);`;
  document.body.appendChild(f);
  f.animate(
    [
      { transform: "scale(1)", opacity: 0.8 },
      { transform: "scale(10)", opacity: 0 },
    ],
    { duration: 460, easing: EXPO, fill: "forwards" },
  ).finished.then(() => f.remove()).catch(() => f.remove());
  pushNotif(d);
}

function pulseCard(): void {
  const c = notifs[0];
  if (!c) return;
  const base = c.style.transform;
  c.animate(
    [{ transform: base }, { transform: `${base} scale(1.045)` }, { transform: base }],
    { duration: 260, easing: EXPO },
  );
}

type V = (d: Dados) => void;
const vJato: V = (d) => { glowBurst(false); emitir(16, 540, 90, 18); window.setTimeout(() => condensar(d), 620); };
const vPulso: V = (d) => {
  glowBurst(true); emitir(10, 400, 60, 14);
  window.setTimeout(() => { glowBurst(false); emitir(14, 440, 80, 16); }, 230);
  window.setTimeout(() => condensar(d), 740);
};
const vCometa: V = (d) => { glowBurst(true); emitir(20, 500, 34, 10); window.setTimeout(() => condensar(d), 600); };
const vMare: V = (d) => { glowBurst(false); emitir(30, 820, 40, 12); window.setTimeout(() => condensar(d), 920); };
const vFagulha: V = (d) => { glowBurst(false); emitir(5, 360, 24, 14); window.setTimeout(() => condensar(d), 380); };
const vConverge: V = (d) => { glowBurst(true); emitir(18, 560, 0, 12, "extremos"); window.setTimeout(() => condensar(d), 660); };
const vEco: V = (d) => {
  glowBurst(false); emitir(12, 440, 60, 14);
  window.setTimeout(() => condensar(d), 540);
  window.setTimeout(() => emitir(8, 360, 30, 12), 620);
  window.setTimeout(pulseCard, 1060);
};
const VARI: V[] = [vJato, vPulso, vCometa, vMare, vFagulha, vConverge, vEco];

function iniciais(s: string): string {
  const limpo = (s || "").trim();
  if (!limpo) return "•";
  const partes = limpo.replace(/[^a-zA-ZÀ-ÿ ]/g, "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "•";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function dispararSopro(dados?: {
  titulo?: string;
  mensagem?: string;
  foto_url?: string | null;
  midia_tipo?: string | null;
}): void {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    if (!medirBarra()) return; // mede a barra EM REPOUSO antes de qualquer glow
    injetarStyles();
    const nome = dados?.titulo || "Nova mensagem";
    const msg = dados?.mensagem || "";
    const d: Dados = {
      ini: iniciais(nome),
      nome,
      msg,
      foto: dados?.foto_url ?? null,
      midiaTipo: dados?.midia_tipo ?? null,
    };
    VARI[vi++ % VARI.length](d);
  } catch {
    /* efeito decorativo — nunca quebra o fluxo de notificação */
  }
}

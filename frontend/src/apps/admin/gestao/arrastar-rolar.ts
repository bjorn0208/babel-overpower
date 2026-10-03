/**
 * Rolar arrastando com o mouse (pedido do Theus, 2026-09-24: "otimizar a rolagem do sistema para dar para
 * clicar e arrastar com o mouse"). Um utilitário só, usado nas tabelas largas (CartaoTabela), no quadro e na
 * semana de Tarefas, na barra de abas, na área de conteúdo da janela e no corpo dos modais.
 *
 * Como funciona:
 *  - só o botão esquerdo do MOUSE (toque e caneta seguem com a rolagem nativa);
 *  - não começa em controle: botão, link, campo, select, textarea, label, summary, [role=button|tab|option],
 *    [contenteditable], [draggable=true] e qualquer coisa marcada com `data-sem-arrastar` (clique, foco,
 *    seleção de texto em campo e arrastar-e-soltar continuam como eram);
 *  - só vira arrasto depois de LIMIAR_PX de movimento: clique parado continua sendo clique;
 *  - cada eixo rola o contêiner mais próximo do ponto clicado que de fato rola naquele eixo (a tabela larga
 *    rola na horizontal; a mesma arrastada na vertical rola a lista em volta);
 *  - depois de um arrasto de verdade, o clique que o navegador dispara ao soltar é engolido (soltar em cima
 *    de uma linha não a abre por engano);
 *  - cursor "grab" quando a área rola, "grabbing" durante o arrasto (o mesmo par de .janela-header e
 *    .dock-drag em bundle.css:245-251 e :511-512).
 * Vários contêineres com o utilitário, um dentro do outro: o mais interno atende e marca o evento, o de
 * fora ignora (não rola duas vezes).
 */

import { useCallback } from "react";

/** Movimento mínimo, em pixels, para o gesto deixar de ser clique e virar arrasto. */
export const LIMIAR_PX = 6;

const NAO_ARRASTA =
  'button, a, input, select, textarea, label, summary, option, [role="button"], [role="tab"], [role="option"], [role="slider"], [contenteditable=""], [contenteditable="true"], [draggable="true"], [data-sem-arrastar]';

const atendidos = new WeakSet<Event>();

function rolaNoEixo(el: HTMLElement, eixo: "x" | "y"): boolean {
  const cs = getComputedStyle(el);
  const ov = eixo === "x" ? cs.overflowX : cs.overflowY;
  if (ov !== "auto" && ov !== "scroll") return false;
  return eixo === "x" ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1;
}

/** Contêiner mais próximo (subindo a partir de `de`) que rola no eixo. */
function alvoDoEixo(de: Element | null, eixo: "x" | "y"): HTMLElement | null {
  for (let el = de; el && el !== document.body; el = el.parentElement) {
    if (el instanceof HTMLElement && rolaNoEixo(el, eixo)) return el;
  }
  return null;
}

/** Liga o arrastar-para-rolar num elemento. Devolve a função que desliga. */
export interface OpcoesArrastar {
  /** Seletor de controles onde o arrasto PODE começar (ex.: '[role="tab"]' na barra de abas, que é só botões).
   *  Clique parado continua sendo clique; só um movimento acima do limiar vira rolagem (e engole o clique). */
  permitirSobre?: string;
}

export function ligarArrastarParaRolar(raiz: HTMLElement, opcoes: OpcoesArrastar = {}): () => void {
  let inicio: { x: number; y: number; id: number; ax: HTMLElement | null; ay: HTMLElement | null; sx: number; sy: number } | null = null;
  let arrastando = false;

  // Dica de "tem mais à direita" (2026-09-25, prints do Adrian): o Babel OS não mostra barra de rolagem, então uma
  // tabela ou barra de abas mais larga que o espaço parecia CORTADA. Enquanto houver conteúdo escondido à direita,
  // a raiz ganha data-mais-a-direita e o gestao.css esmaece a borda direita; no fim da rolagem a marca some.
  const atualizaDica = () => {
    const mais = raiz.scrollWidth - raiz.clientWidth - raiz.scrollLeft > 1;
    if (mais) raiz.setAttribute("data-mais-a-direita", "");
    else raiz.removeAttribute("data-mais-a-direita");
  };

  const atualizaCursor = () => {
    atualizaDica();
    if (arrastando) return;
    raiz.style.cursor = rolaNoEixo(raiz, "x") || rolaNoEixo(raiz, "y") ? "grab" : "";
  };

  const aoDescer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || atendidos.has(e)) return;
    const alvo = e.target as Element | null;
    if (!alvo) return;
    const controle = alvo.closest(NAO_ARRASTA);
    if (controle && !(opcoes.permitirSobre && controle.matches(opcoes.permitirSobre))) return;
    const ax = alvoDoEixo(alvo, "x");
    const ay = alvoDoEixo(alvo, "y");
    if (!ax && !ay) return;
    // só atende o que está dentro da raiz (os alvos podem ser a própria raiz ou filhos/ancestrais dela)
    atendidos.add(e);
    inicio = { x: e.clientX, y: e.clientY, id: e.pointerId, ax, ay, sx: ax?.scrollLeft ?? 0, sy: ay?.scrollTop ?? 0 };
    arrastando = false;
  };

  const aoMover = (e: PointerEvent) => {
    if (!inicio || e.pointerId !== inicio.id) return;
    if ((e.buttons & 1) === 0) return aoSubir();
    const dx = e.clientX - inicio.x;
    const dy = e.clientY - inicio.y;
    if (!arrastando) {
      if (Math.abs(dx) < LIMIAR_PX && Math.abs(dy) < LIMIAR_PX) return;
      arrastando = true;
      try {
        raiz.setPointerCapture(e.pointerId);
      } catch {
        /* o ponteiro já saiu: segue sem captura */
      }
      raiz.style.cursor = "grabbing";
      raiz.style.userSelect = "none";
      window.getSelection()?.removeAllRanges();
    }
    e.preventDefault();
    if (inicio.ax) inicio.ax.scrollLeft = inicio.sx - dx;
    if (inicio.ay) inicio.ay.scrollTop = inicio.sy - dy;
  };

  const engoleClique = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
  };

  const aoSubir = () => {
    if (!inicio) return;
    const id = inicio.id;
    inicio = null;
    if (!arrastando) return;
    arrastando = false;
    try {
      if (raiz.hasPointerCapture(id)) raiz.releasePointerCapture(id);
    } catch {
      /* nada a soltar */
    }
    raiz.style.userSelect = "";
    atualizaCursor();
    // o clique que o navegador dispara logo depois do pointerup não deve abrir nada
    window.addEventListener("click", engoleClique, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", engoleClique, { capture: true }), 0);
  };

  // imagem e texto selecionado têm arrasto nativo do navegador: durante o gesto, ele não pode roubar o mouse
  const aoArrastarNativo = (e: DragEvent) => {
    if (inicio && !(e.target as Element | null)?.closest?.('[draggable="true"]')) e.preventDefault();
  };

  raiz.addEventListener("pointerdown", aoDescer);
  raiz.addEventListener("dragstart", aoArrastarNativo);
  raiz.addEventListener("pointermove", aoMover);
  raiz.addEventListener("pointerup", aoSubir);
  raiz.addEventListener("pointercancel", aoSubir);
  raiz.addEventListener("pointerenter", atualizaCursor);
  raiz.addEventListener("scroll", atualizaDica, { passive: true });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(atualizaCursor) : null;
  ro?.observe(raiz);
  if (raiz.firstElementChild) ro?.observe(raiz.firstElementChild);
  atualizaCursor();

  return () => {
    raiz.removeEventListener("pointerdown", aoDescer);
    raiz.removeEventListener("dragstart", aoArrastarNativo);
    raiz.removeEventListener("pointermove", aoMover);
    raiz.removeEventListener("pointerup", aoSubir);
    raiz.removeEventListener("pointercancel", aoSubir);
    raiz.removeEventListener("pointerenter", atualizaCursor);
    raiz.removeEventListener("scroll", atualizaDica);
    raiz.removeAttribute("data-mais-a-direita");
    ro?.disconnect();
    raiz.style.cursor = "";
    raiz.style.userSelect = "";
  };
}

/**
 * Hook: `const arrastar = usarArrastarParaRolar(); <div ref={arrastar} style={{ overflowX: "auto" }}>…`.
 * Ref de callback com limpeza (React 19): liga ao montar e desliga ao desmontar.
 */
export function usarArrastarParaRolar<T extends HTMLElement = HTMLDivElement>(permitirSobre?: string) {
  return useCallback(
    (el: T | null) => {
      if (!el) return;
      return ligarArrastarParaRolar(el, { permitirSobre });
    },
    [permitirSobre],
  );
}

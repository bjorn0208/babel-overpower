/**
 * Janela do Ragentic OS — drag + resize + edge-snap + maximize animado.
 *
 * Era em bundle.jsx:474-568. Refatorado 2026-05-13 (Fase 1B + fix UX).
 *
 * UX FIXES 2026-05-13 (Theus relatou):
 *  - Drag funciona EM QUALQUER PARTE da janela (não só header).
 *    Guard: ignora se target é botão/input/textarea/select/scrollable
 *    ou se está na borda de resize.
 *  - Drag LEVE: transforma via `transform: translate(dx, dy)` direto no DOM
 *    com requestAnimationFrame. Zero re-render React durante o movimento.
 *    Commit no Zustand (onMove) só no pointerup. Padrão macOS / DaedalOS.
 *  - Removido `layout` prop do motion.div (estava forçando layout recalc
 *    em cada frame). Maximize agora anima via animate prop + key.
 *
 * Acessibilidade:
 *  - role="dialog" + aria-labelledby (título sr-only)
 *  - traffic lights como <button> com aria-label
 *  - prefers-reduced-motion via @media global em bundle.css
 *
 * DaedalOS pattern: body.classList 'janela-arrastando' durante drag
 * pra desabilitar pointer-events em iframes filhos.
 *
 * Compat: bundle.jsx envia ~14 props. Mantemos shape exato.
 */

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { duration, easing, springSnap } from "@/os/motion/presets";
import {
  CURSORES_RESIZE,
  MIN_JANELA_W,
  MIN_JANELA_H,
  detectarBordaJanela,
} from "./detectarBorda";
import { ehCanto, calcularResizeCanto } from "./zoomCanto";
import { pontoSobreTextoSelecionavel } from "./selecaoTexto";

const CURSORES_RESIZE_LOCAL: Record<string, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

interface JanelaProps {
  id: string;
  titulo: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onFocus: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize?: (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    zoom?: number,
  ) => void;
  onMaximize: (id: string) => void;
  onEdgeDrop?: (id: string, lado: "left" | "right") => void;
  onDragHint?: (lado: "left" | "right" | null) => void;
  maximized: boolean;
  minContentW?: number;
  minContentH?: number;
  /** Zoom do conteúdo (1 = 100%). Só o resize de canto mexe nisso. */
  zoom?: number;
  /** Tamanho padrão do app (= 100% de zoom). */
  baseW?: number;
  baseH?: number;
  /**
   * Quando true, esconde APENAS o botão verde de maximizar (`.tl-max`)
   * mantendo o `.janela-header` padrão do sistema (pílula glassmorphism
   * centralizada com vermelho/amarelo). Usado pelo app Curadoria
   * (`/admin/curadoria`) que é o único app fullscreen do admin —
   * sempre maximizado, sem opção de restaurar (decisão Theus 2026-05-27).
   * Default: false (3 botões padrão do sistema).
   */
  semBotaoMaximizar?: boolean;
  children?: ReactNode;
}

/**
 * Retorna true se o target (ou algum ancestral até a janela) for um
 * elemento DIRETAMENTE interativo — botões, inputs, links, contenteditable.
 *
 * NÃO bloqueia scrollables: scroll via wheel/touch continua funcionando,
 * e drag de janela tem prioridade sobre seleção de texto em UI não-textual.
 *
 * Filosofia: usuário deve poder agarrar a janela em QUALQUER lugar exceto
 * onde tem um controle ativo.
 */
function alvoBloqueiaDrag(target: HTMLElement, container: HTMLElement): boolean {
  let el: HTMLElement | null = target;
  while (el && el !== container) {
    if (
      el.tagName === "BUTTON" ||
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.tagName === "A"
    ) {
      return true;
    }
    const role = el.getAttribute("role");
    if (
      role === "button" ||
      role === "link" ||
      role === "textbox" ||
      role === "combobox" ||
      role === "menuitem" ||
      role === "tab" ||
      role === "checkbox" ||
      role === "radio" ||
      role === "switch" ||
      role === "slider" ||
      role === "option"
    ) {
      return true;
    }
    if (el.isContentEditable) return true;
    // Elemento explicitamente arrastável (drag-and-drop nativo do app)
    if (el.getAttribute("draggable") === "true") return true;
    el = el.parentElement;
  }
  return false;
}

export function Janela({
  id,
  titulo,
  x,
  y,
  w,
  h,
  z,
  onClose,
  onMinimize,
  onFocus,
  onMove,
  onResize,
  onMaximize,
  onEdgeDrop,
  onDragHint,
  maximized,
  minContentW,
  minContentH,
  zoom,
  baseW,
  baseH,
  semBotaoMaximizar,
  children,
}: JanelaProps) {
  const refJanela = useRef<HTMLDivElement | null>(null);
  const refConteudo = useRef<HTMLDivElement | null>(null);
  // Guarda a limpeza do arrasto/resize em andamento (remover listeners de window +
  // cancelar rAF). Os listeners de pointermove/up são registrados no pointerdown e
  // só removidos no pointerup — se a janela desmontar NO MEIO do arrasto (fechar,
  // trocar de desktop) eles ficam pendurados no window. Este effect roda a limpeza
  // no unmount.
  const limpezaArrasteRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      limpezaArrasteRef.current?.();
      limpezaArrasteRef.current = null;
    };
  }, []);
  const tituloId = `janela-titulo-${id}`;
  const zoomAtual = maximized ? 1 : zoom ?? 1;

  // Keyboard shortcuts macOS-like — só quando a janela está em foco (z mais alto).
  // ⌘W fecha · ⌘M minimiza · ⌘↑ maximiza/restaura · ⌘← snap esquerda · ⌘→ snap direita.
  // Fix P1 da auditoria janela-impeccable-critique-2026-05-13: Theus admin abre 10 janelas =
  // 100 cliques sem atalho; admin workflow exige kbd.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey && !e.ctrlKey) return;
      const focado = refJanela.current === document.activeElement
        || refJanela.current?.contains(document.activeElement);
      if (!focado) return;
      switch (e.key.toLowerCase()) {
        case "w":
          e.preventDefault();
          onClose(id);
          break;
        case "m":
          e.preventDefault();
          onMinimize(id);
          break;
        case "arrowup":
          e.preventDefault();
          onMaximize(id);
          break;
        case "arrowleft":
          e.preventDefault();
          onEdgeDrop?.(id, "left");
          break;
        case "arrowright":
          e.preventDefault();
          onEdgeDrop?.(id, "right");
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [id, onClose, onMinimize, onMaximize, onEdgeDrop]);

  // Resize pelas bordas/cantos — detecta direção no pointerdown, ajusta w/h/x/y
  // em tempo real via style direto (zero re-render React durante o drag);
  // commit no Zustand acontece uma vez no pointerup via `onResize(id, x, y, w, h)`.
  const iniciarResize = (e: React.PointerEvent<HTMLDivElement>, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    const el = refJanela.current;
    if (!el || !onResize) return;

    onFocus(id);
    document.body.classList.add("janela-redimensionando");
    document.body.style.cursor = CURSORES_RESIZE_LOCAL[dir] || "default";

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = x;
    const origY = y;
    const origW = w;
    const origH = h;

    const corner = ehCanto(dir);
    const refBaseW = baseW ?? origW;
    const refBaseH = baseH ?? origH;

    let novoX = origX;
    let novoY = origY;
    let novoW = origW;
    let novoH = origH;
    let novoZoom = zoomAtual;
    let rafId = 0;

    const aplicar = () => {
      el.style.left = `${novoX}px`;
      el.style.top = `${novoY}px`;
      el.style.width = `${novoW}px`;
      el.style.height = `${novoH}px`;
      if (corner) {
        refConteudo.current?.style.setProperty("zoom", String(novoZoom));
      }
      rafId = 0;
    };

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      // CANTO: proporção travada — moldura + conteúdo escalam juntos (zoom).
      if (corner) {
        const r = calcularResizeCanto({
          dir,
          dx,
          dy,
          origX,
          origY,
          origW,
          origH,
          baseW: refBaseW,
          baseH: refBaseH,
        });
        novoX = r.x;
        novoY = r.y;
        novoW = r.w;
        novoH = r.h;
        novoZoom = r.zoom;
        if (!rafId) rafId = requestAnimationFrame(aplicar);
        return;
      }

      // BORDA: resize livre — só esconde/revela conteúdo (zoom intacto).
      novoX = origX;
      novoY = origY;
      novoW = origW;
      novoH = origH;

      // Eixo horizontal — letras `e` (leste/direita) e `w` (oeste/esquerda)
      if (dir.includes("e")) {
        novoW = Math.max(MIN_JANELA_W, origW + dx);
      }
      if (dir.includes("w")) {
        const propW = origW - dx;
        if (propW >= MIN_JANELA_W) {
          novoW = propW;
          novoX = origX + dx;
        } else {
          novoW = MIN_JANELA_W;
          novoX = origX + (origW - MIN_JANELA_W);
        }
      }

      // Eixo vertical — letras `n` (norte/cima) e `s` (sul/baixo)
      if (dir.includes("s")) {
        novoH = Math.max(MIN_JANELA_H, origH + dy);
      }
      if (dir.includes("n")) {
        const propH = origH - dy;
        if (propH >= MIN_JANELA_H) {
          novoH = propH;
          novoY = origY + dy;
        } else {
          novoH = MIN_JANELA_H;
          novoY = origY + (origH - MIN_JANELA_H);
        }
      }

      // Clamp na viewport (não deixa borda superior sumir)
      if (novoY < 0) {
        novoH += novoY;
        novoY = 0;
      }

      if (!rafId) rafId = requestAnimationFrame(aplicar);
    };

    const desligarListeners = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      limpezaArrasteRef.current = null;
    };

    const up = () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.body.classList.remove("janela-redimensionando");
      document.body.style.cursor = "";
      desligarListeners();
      onResize(id, novoX, novoY, novoW, novoH, corner ? novoZoom : zoomAtual);
    };

    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    // Se a janela desmontar no meio do resize, o unmount roda esta limpeza.
    limpezaArrasteRef.current = () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.body.classList.remove("janela-redimensionando");
      document.body.style.cursor = "";
      desligarListeners();
    };
  };

  // Drag em QUALQUER parte da janela — transform direto no DOM (zero re-render React)
  const onJanelaPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
  ): void => {
    if (e.button !== 0) return;
    if (maximized) return; // não drag quando maximizado

    const el = refJanela.current;
    if (!el) return;

    const target = e.target as HTMLElement;

    // Guard 1: controle interativo (semáforo fechar/min/max, inputs, etc)
    // — clica, nunca redimensiona nem arrasta. ANTES da borda DE PROPÓSITO:
    // o header é fino e a faixa de resize é generosa; se a borda viesse
    // primeiro, os botões do header morriam (regressão 49efb1e).
    if (alvoBloqueiaDrag(target, el)) return;


    // Guard 2: header (barra de título) = arrasto puro, nunca resize
    // (igual macOS). Só o CORPO redimensiona.
    const noHeader = !!target.closest(".janela-header");

    if (!noHeader) {
      // Guard 3: borda/canto do corpo → resize (com zoom no canto).
      const r = el.getBoundingClientRect();
      const dir = detectarBordaJanela(e.clientX, e.clientY, r);
      if (dir !== "") {
        iniciarResize(e, dir);
        return;
      }

      // Guard 4: sobre texto selecionável — deixa copiar (seleção nativa).
      if (pontoSobreTextoSelecionavel(e.clientX, e.clientY, el)) return;
    }

    onFocus(id);
    e.preventDefault();

    document.body.classList.add("janela-arrastando");

    const startMx = e.clientX;
    const startMy = e.clientY;
    let ultimoDx = 0;
    let ultimoDy = 0;
    let rafId = 0;

    const aplicarTransform = (): void => {
      el.style.transform = `translate3d(${ultimoDx}px, ${ultimoDy}px, 0)`;
      rafId = 0;
    };

    const move = (ev: PointerEvent): void => {
      ultimoDx = ev.clientX - startMx;
      ultimoDy = ev.clientY - startMy;
      if (!rafId) {
        rafId = requestAnimationFrame(aplicarTransform);
      }
      // Edge hint (drag pra borda)
      const vw = window.innerWidth;
      if (ev.clientX < 80) onDragHint?.("left");
      else if (ev.clientX > vw - 80) onDragHint?.("right");
      else onDragHint?.(null);
    };

    const up = (ev: PointerEvent): void => {
      if (rafId) cancelAnimationFrame(rafId);
      // Reset do transform — vai ser substituído pela nova posição via state
      el.style.transform = "";

      // Clamp viewport (fix P1 viewport-clamp janela-impeccable-critique):
      // janela arrastada além da viewport = "perdida". Mantém pelo menos
      // 80px visíveis pra ainda ser pegável.
      const margemMinima = 80;
      const rawX = x + (ev.clientX - startMx);
      const rawY = y + (ev.clientY - startMy);
      const finalX = Math.max(
        margemMinima - w,
        Math.min(rawX, window.innerWidth - margemMinima),
      );
      const finalY = Math.max(0, Math.min(rawY, window.innerHeight - margemMinima));

      const vw = window.innerWidth;
      if (ev.clientX < 80) {
        onEdgeDrop?.(id, "left");
      } else if (ev.clientX > vw - 80) {
        onEdgeDrop?.(id, "right");
      } else {
        // Commit posição final no Zustand uma única vez
        onMove(id, finalX, finalY);
      }
      onDragHint?.(null);

      document.body.classList.remove("janela-arrastando");
      desligarListeners();
    };

    const desligarListeners = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      limpezaArrasteRef.current = null;
    };

    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    // Se a janela desmontar no meio do arrasto, o unmount roda esta limpeza.
    limpezaArrasteRef.current = () => {
      if (rafId) cancelAnimationFrame(rafId);
      el.style.transform = "";
      document.body.classList.remove("janela-arrastando");
      desligarListeners();
    };
  };

  // Hover dinâmico — cursor de resize só onde o clique REALMENTE redimensiona.
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (maximized) return;
    const el = refJanela.current;
    if (!el || document.body.classList.contains("janela-arrastando")) return;
    const target = e.target as HTMLElement;
    // Header e controles não redimensionam → cursor neutro (sem seta de
    // resize onde o clique arrasta/clica). Casa com o onJanelaPointerDown.
    if (alvoBloqueiaDrag(target, el) || target.closest(".janela-header")) {
      el.style.cursor = "";
      return;
    }
    // No corpo: mesma detecção do pointerdown → cursor bate com a ação.
    // Fora da borda, "" deixa o I-beam do texto aparecer.
    const dir = detectarBordaJanela(
      e.clientX,
      e.clientY,
      el.getBoundingClientRect(),
    );
    el.style.cursor = dir
      ? CURSORES_RESIZE[dir as keyof typeof CURSORES_RESIZE]
      : "";
  };

  const styleNormal = { left: x, top: y, width: w, height: h, zIndex: z };
  const styleMaximizado = {
    left: 0,
    top: 0,
    width: "100vw" as const,
    height: "100vh" as const,
    zIndex: 999,
    borderRadius: 0,
  };

  return (
    <motion.div
      ref={refJanela}
      className="janela"
      role="dialog"
      aria-labelledby={tituloId}
      style={maximized ? styleMaximizado : styleNormal}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.96,
        transition: { duration: duration.fast, ease: easing.inExpo },
      }}
      transition={springSnap}
      onPointerDown={onJanelaPointerDown}
      onPointerMove={onPointerMove}
    >
      <div
        className="janela-header"
        // Duplo clique na barra de título = maximizar/restaurar (igual botão
        // verde). Guard: clique em botão do semáforo não conta.
        onDoubleClick={(e) => {
          const el = refJanela.current;
          if (!el) return;
          if (alvoBloqueiaDrag(e.target as HTMLElement, el)) return;
          onMaximize(id);
        }}
      >
        <div
          className="janela-traffic"
          role="group"
          aria-label="Controles da janela"
          // Defesa direta no elemento (além da zona por coordenadas do Guard 1.5):
          // o pointerdown morre aqui e NUNCA vira arrasto — só os cliques dos botões.
          onPointerDownCapture={(e) => e.stopPropagation()}
          style={{ cursor: "default" }}
        >
          <button
            type="button"
            className="tl tl-close"
            onClick={() => onClose(id)}
            aria-label="Fechar"
            title="Fechar"
          />
          <button
            type="button"
            className="tl tl-min"
            onClick={() => onMinimize(id)}
            aria-label="Minimizar"
            title="Minimizar"
          />
          {!semBotaoMaximizar && (
            <button
              type="button"
              className="tl tl-max"
              onClick={() => onMaximize(id)}
              aria-label={maximized ? "Restaurar janela" : "Maximizar"}
              title={maximized ? "Restaurar" : "Maximizar"}
            />
          )}
        </div>
        <span
          id={tituloId}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
          }}
        >
          {titulo}
        </span>
      </div>
      <div className="janela-body">
        <div className="janela-body-inner scroll">
          <div
            ref={refConteudo}
            className="janela-body-content"
            style={
              {
                // Maximizado = app de tela cheia: conteúdo fluido, sem largura
                // mínima do tamanho natural — senão telefone ganha scroll
                // lateral sobre um wrapper de 1000+px (bug modo celular 26/08).
                minWidth: maximized ? undefined : minContentW || undefined,
                minHeight: maximized ? undefined : minContentH || undefined,
                zoom: zoomAtual,
              } as CSSProperties
            }
          >
            {children}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

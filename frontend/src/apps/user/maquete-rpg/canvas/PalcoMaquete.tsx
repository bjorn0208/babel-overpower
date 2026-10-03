/**
 * PalcoMaquete — wrapper do <Application> do PixiJS v8 + @pixi/react v8.
 *
 * Câmera com zoom + pan:
 *  - escala inicial = "fit" (cabe o mapa inteiro no viewport, sem borda preta
 *    porque o background do Application = cor do chão).
 *  - scroll do mouse = zoom in/out centrado no cursor.
 *  - arrastar com mouse = pan.
 *  - botões +/-/⤧ no canto: zoom in, zoom out, resetar pra "fit".
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Application, extend, type ApplicationRef } from "@pixi/react";
import { Application as PixiApplication, Container, Graphics, Sprite, Text } from "pixi.js";
import { Plus, Minus, Maximize2, LocateFixed } from "lucide-react";
import { MapaEmpresa, LARGURA_MAPA, ALTURA_MAPA } from "./MapaEmpresa";
import { CamadaBonecos } from "./bonecos/CamadaBonecos";
import { carregarTexturas, type CatalogoTexturas } from "../assets/texturas";

extend({ Container, Graphics, Sprite, Text });

/** Cor do chão (floor_0) — usada como bg do canvas pra disfarçar bordas. */
const COR_CHAO = 0x6b5a47;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 6;

export interface PalcoMaqueteProps {
  onAbrirConversa?: (conversaId: string) => void;
  /** Modo widget: mostra o botão de expandir (abre a maquete em janela cheia). */
  onExpandir?: () => void;
}

export function PalcoMaquete({ onAbrirConversa, onExpandir }: PalcoMaqueteProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<ApplicationRef>(null);
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  const [texturas, setTexturas] = useState<CatalogoTexturas | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // câmera: escala + offset (em px do viewport)
  const [escala, setEscala] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const escalaFitRef = useRef(1);
  const fitAplicadoRef = useRef(false);
  const usuarioInteragiuRef = useRef(false);

  useEffect(() => {
    let vivo = true;
    carregarTexturas()
      .then((cat) => vivo && setTexturas(cat))
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const medir = () => {
      const rect = el.getBoundingClientRect();
      const largura = Math.max(1, Math.round(rect.width));
      const altura = Math.max(1, Math.round(rect.height));
      setTamanho((atual) =>
        atual.largura === largura && atual.altura === altura ? atual : { largura, altura },
      );
    };
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    medir();
    window.addEventListener("resize", medir);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  const aplicarResizeRenderer = useCallback(
    (app?: PixiApplication | null) => {
      const pixi = app ?? appRef.current?.getApplication();
      if (!pixi?.renderer || tamanho.largura <= 0 || tamanho.altura <= 0) return;
      pixi.renderer.resize(tamanho.largura, tamanho.altura);
      const canvas = appRef.current?.getCanvas();
      if (canvas) {
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
      }
    },
    [tamanho],
  );

  useEffect(() => {
    aplicarResizeRenderer();
  }, [aplicarResizeRenderer]);

  // calcula escala "fit" e aplica no 1º render válido (ou quando o viewport muda muito)
  // Multiplicador extra: o mapa isométrico é um losango dentro de um bounding-box
  // retangular, então "cover" puro deixa o conteúdo parecendo pequeno. 1.5x aproxima
  // a câmera o suficiente pra ler nomes/etiquetas sem cortar conteúdo relevante.
  const ZOOM_INICIAL_EXTRA = 1.5;
  const escalaFit = useMemo(() => {
    if (tamanho.largura === 0 || tamanho.altura === 0) return 0;
    return Math.max(tamanho.largura / LARGURA_MAPA, tamanho.altura / ALTURA_MAPA) * ZOOM_INICIAL_EXTRA;
  }, [tamanho]);

  // useLayoutEffect: aplica fit ANTES do paint, evita flash de escala=1
  useLayoutEffect(() => {
    const fitAnterior = escalaFitRef.current;
    escalaFitRef.current = escalaFit;
    if (escalaFit <= 0) return;
    if (!fitAplicadoRef.current) {
      fitAplicadoRef.current = true;
      setEscala(escalaFit);
      setOffset({
        x: (tamanho.largura - LARGURA_MAPA * escalaFit) / 2,
        y: (tamanho.altura - ALTURA_MAPA * escalaFit) / 2,
      });
      return;
    }
    if (fitAnterior > 0 && Math.abs(escalaFit - fitAnterior) > 0.001) {
      const razao = usuarioInteragiuRef.current ? escala / fitAnterior : 1;
      const novaEscala = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, escalaFit * razao));
      setEscala(novaEscala);
      setOffset({
        x: (tamanho.largura - LARGURA_MAPA * novaEscala) / 2,
        y: (tamanho.altura - ALTURA_MAPA * novaEscala) / 2,
      });
    }
  }, [escalaFit, tamanho, escala]);

  const resetarCamera = useCallback(() => {
    usuarioInteragiuRef.current = false;
    const e = escalaFitRef.current;
    setEscala(e);
    setOffset({
      x: (tamanho.largura - LARGURA_MAPA * e) / 2,
      y: (tamanho.altura - ALTURA_MAPA * e) / 2,
    });
  }, [tamanho]);

  /**
   * Clampa o offset pra impedir que a maquete escape demais do viewport.
   * Como o mapa isométrico é um losango dentro de um bounding-box retangular,
   * adicionamos um "overscroll" generoso (40% do viewport) pra permitir
   * arrastar até os cantos do losango sem prender no bounding-box.
   */
  const clampOffset = useCallback(
    (off: { x: number; y: number }, esc: number) => {
      const mapaW = LARGURA_MAPA * esc;
      const mapaH = ALTURA_MAPA * esc;
      const vw = tamanho.largura;
      const vh = tamanho.altura;
      const padX = vw * 0.4;
      const padY = vh * 0.4;
      let { x, y } = off;
      // X: permite ir de (vw - mapaW - padX) até (padX)
      x = Math.min(padX, Math.max(vw - mapaW - padX, x));
      // Y: idem
      y = Math.min(padY, Math.max(vh - mapaH - padY, y));
      return { x, y };
    },
    [tamanho],
  );

  // wheel zoom (centrado no cursor)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      usuarioInteragiuRef.current = true;
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const fator = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      setEscala((escAtual) => {
        const nova = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, escAtual * fator));
        setOffset((off) => {
          const mundoX = (px - off.x) / escAtual;
          const mundoY = (py - off.y) / escAtual;
          return clampOffset({ x: px - mundoX * nova, y: py - mundoY * nova }, nova);
        });
        return nova;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clampOffset]);

  // pan (mouse/touch/caneta unificados via Pointer Events) + pinça pro zoom.
  // 1 pointer ativo = pan (mesma lógica de sempre). 2 pointers = pinça: zoom
  // ancorado no ponto médio móvel entre os 2 dedos (mesma matemática do zoom
  // por wheel, generalizada). Soltar 1 dedo durante a pinça não pode pular a
  // câmera — reseedamos o drag a partir da posição atual do dedo restante.
  const ponteirosRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const arrasteRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinçaRef = useRef<{
    distancia: number;
    escala: number;
    offset: { x: number; y: number };
  } | null>(null);

  const centroPonteiros = useCallback(() => {
    const pts = Array.from(ponteirosRef.current.values());
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }, []);

  const onPointerDown = (ev: React.PointerEvent) => {
    // Botões do HUD têm clique próprio: capturar o ponteiro aqui roubava o
    // click (principalmente no widget) e ainda iniciava um pan fantasma.
    if ((ev.target as Element).closest("button")) return;
    usuarioInteragiuRef.current = true;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    ponteirosRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (ponteirosRef.current.size === 2) {
      arrasteRef.current = null;
      const pts = Array.from(ponteirosRef.current.values());
      pinçaRef.current = {
        distancia: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        escala,
        offset,
      };
    } else if (ponteirosRef.current.size === 1) {
      arrasteRef.current = { x: ev.clientX, y: ev.clientY, ox: offset.x, oy: offset.y };
    }
  };

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      if (!ponteirosRef.current.has(ev.pointerId)) return;
      ponteirosRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      if (ponteirosRef.current.size >= 2 && pinçaRef.current) {
        const { distancia, escala: escalaInicial, offset: offsetInicial } = pinçaRef.current;
        const pts = Array.from(ponteirosRef.current.values()).slice(0, 2);
        const distanciaNova = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const nova = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, escalaInicial * (distanciaNova / distancia)));
        const centro = centroPonteiros();
        const mundoX = (centro.x - offsetInicial.x) / escalaInicial;
        const mundoY = (centro.y - offsetInicial.y) / escalaInicial;
        setEscala(nova);
        setOffset(clampOffset({ x: centro.x - mundoX * nova, y: centro.y - mundoY * nova }, nova));
        return;
      }

      const a = arrasteRef.current;
      if (!a || ponteirosRef.current.size !== 1) return;
      setOffset(clampOffset({ x: a.ox + (ev.clientX - a.x), y: a.oy + (ev.clientY - a.y) }, escala));
    };

    const onUpOuCancel = (ev: PointerEvent) => {
      ponteirosRef.current.delete(ev.pointerId);
      if (ponteirosRef.current.size < 2) pinçaRef.current = null;
      if (ponteirosRef.current.size === 1) {
        // transição pinça→pan: reseeda a partir do dedo remanescente, sem pular.
        const [id, p] = Array.from(ponteirosRef.current.entries())[0];
        arrasteRef.current = { x: p.x, y: p.y, ox: offset.x, oy: offset.y };
        void id;
      } else if (ponteirosRef.current.size === 0) {
        arrasteRef.current = null;
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUpOuCancel);
    window.addEventListener("pointercancel", onUpOuCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUpOuCancel);
      window.removeEventListener("pointercancel", onUpOuCancel);
    };
  }, [clampOffset, escala, offset, centroPonteiros]);

  // Reclampa quando viewport muda (resize)
  useEffect(() => {
    setOffset((off) => clampOffset(off, escala));
  }, [clampOffset, escala]);

  const zoomBtn = (delta: number) => {
    usuarioInteragiuRef.current = true;
    const px = tamanho.largura / 2;
    const py = tamanho.altura / 2;
    const nova = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, escala * delta));
    const mundoX = (px - offset.x) / escala;
    const mundoY = (py - offset.y) / escala;
    setEscala(nova);
    setOffset(clampOffset({ x: px - mundoX * nova, y: py - mundoY * nova }, nova));
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      className="absolute inset-0 overflow-hidden touch-none cursor-grab active:cursor-grabbing"
    >
      {erro && (
        <div className="absolute inset-0 grid place-content-center text-sm text-red-400">
          Falha ao carregar sprites: {erro}
        </div>
      )}
      {!erro && !texturas && (
        <div className="absolute inset-0 grid place-content-center text-xs text-zinc-500">
          Carregando maquete…
        </div>
      )}
      {texturas && tamanho.largura > 0 && tamanho.altura > 0 && fitAplicadoRef.current && (
        <Application
          ref={appRef}
          width={tamanho.largura}
          height={tamanho.altura}
          resizeTo={containerRef}
          className="h-full w-full"
          onInit={(app) => aplicarResizeRenderer(app)}
          backgroundAlpha={0}
          antialias={false}
          autoDensity
          resolution={window.devicePixelRatio || 1}
        >
          <pixiContainer x={offset.x} y={offset.y} scale={escala}>
            <MapaEmpresa texturas={texturas} />
            <CamadaBonecos texturas={texturas} onAbrirConversa={onAbrirConversa} />
          </pixiContainer>
        </Application>
      )}

      {/* Tinta dia/noite baseada no horário real (multiply leve sobre a cena) */}
      {(() => {
        const h = new Date().getHours();
        // amanhecer (5-8) warm, dia (8-17) neutro, fim de tarde (17-19) âmbar,
        // noite (19-5) azul-violeta
        let tint = "transparent";
        let alpha = 0;
        if (h >= 5 && h < 8) { tint = "rgb(255,200,140)"; alpha = 0.10; }
        else if (h >= 17 && h < 19) { tint = "rgb(255,170,90)"; alpha = 0.14; }
        else if (h >= 19 || h < 5) { tint = "rgb(60,80,140)"; alpha = 0.22; }
        return (
          <div
            className="pointer-events-none absolute inset-0 z-[4] transition-opacity duration-700"
            style={{ backgroundColor: tint, opacity: alpha, mixBlendMode: "multiply" }}
          />
        );
      })()}

      {/* Vinheta cinematográfica — foco no palco, sem capturar ponteiro */}
      <div
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.32) 88%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {/* Brilho sutil no topo (luz ambiente) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-24"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,240,210,0.06), transparent)",
        }}
      />

      {/* HUD de câmera — glassmorphism com microinterações */}
      <div className="absolute right-3 bottom-3 z-10 flex flex-col gap-0.5 rounded-xl border border-white/10 bg-zinc-950/55 p-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] backdrop-blur-md ring-1 ring-inset ring-white/5">
        <button
          type="button"
          onClick={() => zoomBtn(1.25)}
          className="group grid h-9 w-9 place-content-center rounded-lg text-zinc-300 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90"
          title="Aproximar"
        >
          <Plus className="h-4 w-4 transition-transform duration-150 group-hover:scale-110" />
        </button>
        <div className="mx-2 h-px bg-white/5" />
        <button
          type="button"
          onClick={() => zoomBtn(1 / 1.25)}
          className="group grid h-9 w-9 place-content-center rounded-lg text-zinc-300 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90"
          title="Afastar"
        >
          <Minus className="h-4 w-4 transition-transform duration-150 group-hover:scale-110" />
        </button>
        <div className="mx-2 h-px bg-white/5" />
        <button
          type="button"
          onClick={resetarCamera}
          className="group grid h-9 w-9 place-content-center rounded-lg text-zinc-300 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90"
          title="Enquadrar"
          aria-label="Enquadrar"
        >
          <LocateFixed className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" />
        </button>
        {onExpandir && (
          <>
            <div className="mx-2 h-px bg-white/5" />
            <button
              type="button"
              onClick={onExpandir}
              className="group grid h-9 w-9 place-content-center rounded-lg text-zinc-300 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90"
              title="Expandir (abrir a maquete)"
              aria-label="Expandir"
            >
              <Maximize2 className="h-3.5 w-3.5 transition-transform duration-150 group-hover:scale-110" />
            </button>
          </>
        )}
      </div>

      {/* Hint de controles — pílula refinada */}
      <div className="pointer-events-none absolute left-3 bottom-3 z-10 flex items-center gap-1.5 rounded-full border border-white/5 bg-zinc-950/55 px-2.5 py-1 text-[10px] font-medium tracking-wide text-zinc-400 shadow-lg backdrop-blur-md">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400/70 animate-pulse" />
        <span>scroll <span className="text-zinc-500">·</span> zoom</span>
        <span className="text-zinc-600">|</span>
        <span>arrastar <span className="text-zinc-500">·</span> mover</span>
      </div>

      {/* Selo REC — sensação de câmera ao vivo (canto superior esquerdo) */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-red-500/30 bg-zinc-950/60 px-2 py-1 shadow-lg backdrop-blur-md">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-70 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.85)]" />
        </span>
        <span className="text-[10px] font-semibold tracking-[0.18em] text-red-400">REC</span>
        <span className="text-[9px] font-mono tabular-nums text-zinc-500">● LIVE</span>
      </div>
    </div>
  );
}

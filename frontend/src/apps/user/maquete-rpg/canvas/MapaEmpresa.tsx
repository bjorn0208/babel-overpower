/**
 * MapaEmpresa — planta do escritório em projeção ISOMÉTRICA REAL (2:1).
 *
 * - Grid lógica 40×25 (col, lin) preservada — simulação/pathfinding não mudam.
 * - Cada tile vira um losango 32×16.
 * - Paredes e móveis são desenhados como CAIXAS ISOMÉTRICAS (3 faces:
 *   topo, lateral-direita, frente-esquerda) usando os helpers em isometria.ts.
 * - Sprites top-down (plantas, cadeiras, sofá, notebook) entram como
 *   BILLBOARDS sobre o losango (anchor 0.5, 1). Eles ficam "em pé"
 *   compondo bem com o cenário iso (mesma técnica de Project Zomboid / Don't Starve).
 * - Z-order por `col + lin` para que o sul-leste cubra o norte-oeste.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Graphics as PixiGraphics, Texture } from "pixi.js";
import type { CatalogoTexturas } from "../assets/texturas";
import { COLUNAS, LINHAS, TAMANHO_TILE_LOGICO } from "./gridConstantes";
import {
  ISO_ALTURA_MAPA,
  ISO_LARGURA_MAPA,
  isoCentro,
  isoTopo,
  pontosLosango,
  pontosTopoBox,
  tileBaseIso,
} from "./isometria";

/** Re-exports pra manter compatibilidade com o resto do código. */
export const TAMANHO_TILE = TAMANHO_TILE_LOGICO;
export { COLUNAS, LINHAS } from "./gridConstantes";
export const LARGURA_MAPA = ISO_LARGURA_MAPA;
export const ALTURA_MAPA = ISO_ALTURA_MAPA;

type Cargo = "atendimento" | "vendedor" | "financeiro" | "suporte" | "mentor";

interface Estacao {
  id: string;
  cargo: Cargo;
  x: number;
  y: number;
}

interface Movel {
  textura: keyof CatalogoTexturas;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/**
 * Planta v2 — arquitetura "funil físico" (2026-05-18).
 *
 * ZONA NORTE (foco): mentoria (canto NO) + 3 atendimentos + 2 financeiros.
 * ZONA CENTRO (espera/decompressão): sofás + tapete persa no coração da sala,
 *   ladeados por copa (SO) e suporte (SE).
 * ZONA SUL (vendas + porta): 4 mesas de vendas em fileira logo acima da porta.
 *
 * Fluxo do lead:
 *   Porta (SO) → Atendimento (N, triagem)
 *              → Espera (centro, qualifica)
 *              → Vendas (S, fecha)
 *              → volta à Espera quando precisa pensar
 */
const ESTACOES: Estacao[] = [
  // === NORTE (lin 4) — triagem e back-office ===
  { id: "ment-1",  cargo: "mentor",       x: 2,  y: 4 },  // canto NO privativo
  { id: "atend-1", cargo: "atendimento",  x: 9,  y: 4 },
  { id: "atend-2", cargo: "atendimento",  x: 15, y: 4 },
  { id: "atend-3", cargo: "atendimento",  x: 21, y: 4 },
  { id: "fin-1",   cargo: "financeiro",   x: 29, y: 4 },
  { id: "fin-2",   cargo: "financeiro",   x: 35, y: 4 },

  // === CENTRO-LESTE (lin 11) — suporte técnico ===
  { id: "sup-1", cargo: "suporte", x: 29, y: 11 },
  { id: "sup-2", cargo: "suporte", x: 35, y: 11 },

  // === SUL (lin 18) — vendas bullpen em fileira, acima da porta ===
  { id: "vend-1", cargo: "vendedor", x: 4,  y: 18 },
  { id: "vend-2", cargo: "vendedor", x: 10, y: 18 },
  { id: "vend-3", cargo: "vendedor", x: 17, y: 18 },
  { id: "vend-4", cargo: "vendedor", x: 23, y: 18 },
];

/** Cores das cabines por cargo (tecido da divisória + carpete), tons sóbrios. */
interface CorCabine { topo: number; sul: number; leste: number; piso: number }
const COR_CABINE: Record<Cargo, CorCabine> = {
  atendimento: { topo: 0x4f86ad, sul: 0x2f5877, leste: 0x3b6a8c, piso: 0x3d5566 },
  vendedor:    { topo: 0xb39247, sul: 0x7a612a, leste: 0x8f7334, piso: 0x5e5238 },
  financeiro:  { topo: 0x559a70, sul: 0x336549, leste: 0x3f7a58, piso: 0x3e5a48 },
  suporte:     { topo: 0x7a6bb8, sul: 0x4c4180, leste: 0x5c4f96, piso: 0x4c4766 },
  mentor:      { topo: 0xab5a72, sul: 0x74364a, leste: 0x8a4259, piso: 0x5e4048 },
};

const DECORACOES: Movel[] = [
  // === COPA / CAFÉ — canto SO (col 2-7, lin 11-13) ===
  { textura: "coffeeTable", x: 3,  y: 12 },           // mesa de café compacta
  { textura: "coffee",      x: 6,  y: 11 },           // cafeteira
  { textura: "bin",         x: 7,  y: 13 },           // lixo
  { textura: "largePlant",  x: 2,  y: 14 },           // planta de escritório

  // === ESPERA CENTRAL — coração da sala ===
  // (sem tapete decorativo — halo procedural ancora a área)
  // Sofá em L: três segmentos atrás do tapete
  { textura: "sofaFront", x: 14, y: 12, w: 2, h: 1 },
  { textura: "sofaFront", x: 16, y: 12, w: 2, h: 1 },
  { textura: "sofaFront", x: 18, y: 12, w: 2, h: 1 },
  { textura: "coffeeTable", x: 16, y: 15 },           // mesa de centro pequena
  { textura: "largePlant",  x: 13, y: 11 },
  { textura: "largePlant",  x: 21, y: 11 },

  // === HUB CENTRAL — passagem entre vendas e espera ===
  // (cacto e plant2 removidos — pareciam perdidos no meio da sala)

  // === PAREDE NORTE — quadros, relógio, whiteboard ===
  { textura: "hangingPlant", x: 7,  y: 1 },
  { textura: "hangingPlant", x: 13, y: 1 },
  { textura: "hangingPlant", x: 19, y: 1 },
  { textura: "whiteboard",   x: 11, y: 0 },
  { textura: "clock",        x: 17, y: 0 },
  { textura: "largePainting", x: 24, y: 0, w: 2, h: 1 },
  { textura: "smallPainting", x: 31, y: 0 },

  // === ESTANTE DE LIVROS — sala do Mentor (canto NO) ===
  { textura: "doubleBookshelf", x: 3, y: 1, w: 2, h: 1 },

  // === PLANTAS DE CANTO ===
  { textura: "largePlant", x: 0,  y: 19 },       // entrada (porta)
  { textura: "largePlant", x: 38, y: 19 },       // canto SE
  { textura: "largePlant", x: 38, y: 4 },        // canto NE
];

export const PORTA = { x: 0, y: 22 };

export interface MapaEmpresaProps {
  texturas: CatalogoTexturas;
}

/**
 * Zonas funcionais — cada uma usa um tom levemente distinto no piso para
 * dar leitura arquitetônica sem cair em tapetes coloridos.
 * Paleta: madeira clara → madeira média → carpete cinza-quente → concreto.
 */
type Zona = "trabalho" | "espera" | "circulacao" | "copa" | "entrada";

function zonaDoTile(col: number, lin: number): Zona {
  // Entrada (porta SO + tapete capacho)
  if (col <= 2 && lin >= PORTA.y - 1 && lin <= PORTA.y + 2) return "entrada";
  // Copa (canto SO)
  if (col >= 1 && col <= 8 && lin >= 10 && lin <= 15) return "copa";
  // Espera central — losango de carpete cinza-quente
  if (col >= 12 && col <= 21 && lin >= 10 && lin <= 16) return "espera";
  // Zonas de trabalho (faixas norte e sul, onde estão as mesas)
  if (lin >= 3 && lin <= 6) return "trabalho";
  if (lin >= 17 && lin <= 19) return "trabalho";
  if (lin >= 10 && lin <= 12 && col >= 27) return "trabalho"; // suporte
  return "circulacao";
}

/** Cor base do losango — variação sutil por zona + xadrez quase imperceptível. */
function corDoChao(col: number, lin: number): number {
  const zona = zonaDoTile(col, lin);
  const xadrez = (col + lin) % 2 === 0 ? 0 : 1;
  switch (zona) {
    case "trabalho":    return xadrez ? 0x7a6750 : 0x705e48; // madeira clara
    case "espera":      return xadrez ? 0x5f5750 : 0x595048; // carpete cinza-quente
    case "copa":        return xadrez ? 0x6e5a44 : 0x685440; // madeira mais quente
    case "entrada":     return xadrez ? 0x4a3d30 : 0x453829; // capacho escuro
    case "circulacao":
    default:            return xadrez ? 0x756352 : 0x6e5c4c; // concreto polido
  }
}

export function MapaEmpresa({ texturas }: MapaEmpresaProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setTick((v) => (v + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ============ CHÃO (losangos isométricos com tom por zona) ============
  const desenharChao = useCallback((g: PixiGraphics) => {
    g.clear();
    for (let lin = 0; lin < LINHAS; lin++) {
      for (let col = 0; col < COLUNAS; col++) {
        const pts = pontosLosango(col, lin);
        const cor = corDoChao(col, lin);
        g.poly(pts).fill(cor).stroke({ width: 0.35, color: 0x000000, alpha: 0.06 });
      }
    }
    // Linha sutil delimitando a zona da espera (como um inset de piso)
    const halo = pontosLosango(12, 10, 10, 7);
    g.poly(halo).stroke({ width: 1.2, color: 0x2a1f18, alpha: 0.25 });
  }, []);

  // ============ PAREDES ISO (caixas extrudidas) ============
  // Parede NORTE = faixa lin = -1 (1 tile de espessura, COLUNAS de comprimento)
  // Parede OESTE = faixa col = -1 (1 tile de espessura, LINHAS de comprimento)
  const ALTURA_PAREDE = 36;
  const desenharParedes = useCallback((g: PixiGraphics) => {
    g.clear();
    const corTopo = 0x6b4a30;
    const corFrenteO = 0x4a3220; // lateral oeste (mais escura)
    const corFrenteE = 0x5a3e28; // lateral leste

    const drawCaixa = (
      col: number,
      lin: number,
      w: number,
      h: number,
      altura: number,
      cTop: number,
      cFrenteEsq: number,
      cFrenteDir: number,
    ) => {
      const { topo, base } = pontosTopoBox(col, lin, w, h, altura);
      // topo (losango)
      g.poly(topo).fill(cTop).stroke({ width: 0.5, color: 0x1a0f08, alpha: 0.5 });
      // FRENTE-DIREITA: vai do canto leste do topo descendo até sul
      // base[2,3]=leste, base[4,5]=sul ; topo correspondentes
      g.poly([
        topo[2], topo[3],
        base[2], base[3],
        base[4], base[5],
        topo[4], topo[5],
      ]).fill(cFrenteDir).stroke({ width: 0.4, color: 0x000000, alpha: 0.35 });
      // FRENTE-ESQUERDA: do oeste do topo descendo até sul
      g.poly([
        topo[6], topo[7],
        base[6], base[7],
        base[4], base[5],
        topo[4], topo[5],
      ]).fill(cFrenteEsq).stroke({ width: 0.4, color: 0x000000, alpha: 0.4 });
    };

    // PAREDE NORTE — segmentos contínuos
    drawCaixa(0, -1, COLUNAS, 1, ALTURA_PAREDE, corTopo, corFrenteO, corFrenteE);

    // PAREDE OESTE em 2 segmentos (deixa vão da porta)
    drawCaixa(-1, 0, 1, PORTA.y, ALTURA_PAREDE, corTopo, corFrenteO, corFrenteE);
    drawCaixa(-1, PORTA.y + 2, 1, LINHAS - PORTA.y - 2, ALTURA_PAREDE, corTopo, corFrenteO, corFrenteE);

    // PAREDE LESTE — fecha o perímetro
    drawCaixa(COLUNAS, 0, 1, LINHAS, ALTURA_PAREDE, corTopo, corFrenteO, corFrenteE);

    // PAREDE SUL — fecha o perímetro
    drawCaixa(-1, LINHAS, COLUNAS + 2, 1, ALTURA_PAREDE, corTopo, corFrenteO, corFrenteE);

    // Vão da porta — batente baixo (madeira) + folha de porta desenhada como
    // paralelogramo na face room-facing da parede oeste.
    drawCaixa(-1, PORTA.y, 1, 2, 4, 0x6b4a30, 0x2d1b0e, 0x3d2818);
    {
      const { topo: tBox, base: bBox } = pontosTopoBox(-1, PORTA.y, 1, 2, ALTURA_PAREDE);
      const tL = { x: tBox[2], y: tBox[3] };
      const tS = { x: tBox[4], y: tBox[5] };
      const bS = { x: bBox[4], y: bBox[5] };
      const bL = { x: bBox[2], y: bBox[3] };
      const lerpP = (a: {x:number;y:number}, b: {x:number;y:number}, t: number) =>
        ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const inH = 0.08, inV = 0.06;
      const d1 = lerpP(lerpP(tL, tS, inH), lerpP(bL, bS, inH), inV);
      const d2 = lerpP(lerpP(tL, tS, 1 - inH), lerpP(bL, bS, 1 - inH), inV);
      const d3 = lerpP(lerpP(tL, tS, 1 - inH), lerpP(bL, bS, 1 - inH), 1 - inV);
      const d4 = lerpP(lerpP(tL, tS, inH), lerpP(bL, bS, inH), 1 - inV);
      // Batente (moldura escura)
      g.poly([d1.x, d1.y, d2.x, d2.y, d3.x, d3.y, d4.x, d4.y])
        .fill(0x2a1a10);
      // Folha de porta (madeira) — inset
      const inH2 = 0.16, inV2 = 0.12;
      const f1 = lerpP(lerpP(tL, tS, inH2), lerpP(bL, bS, inH2), inV2);
      const f2 = lerpP(lerpP(tL, tS, 1 - inH2), lerpP(bL, bS, 1 - inH2), inV2);
      const f3 = lerpP(lerpP(tL, tS, 1 - inH2), lerpP(bL, bS, 1 - inH2), 1 - inV2);
      const f4 = lerpP(lerpP(tL, tS, inH2), lerpP(bL, bS, inH2), 1 - inV2);
      g.poly([f1.x, f1.y, f2.x, f2.y, f3.x, f3.y, f4.x, f4.y])
        .fill(0x8b5a2b)
        .stroke({ width: 0.6, color: 0x2a1a10 });
      // Painéis decorativos (2 retângulos internos)
      const painel = (t1: number, t2: number) => {
        const a1 = lerpP(lerpP(tL, tS, inH2 + 0.06), lerpP(bL, bS, inH2 + 0.06), t1);
        const a2 = lerpP(lerpP(tL, tS, 1 - inH2 - 0.06), lerpP(bL, bS, 1 - inH2 - 0.06), t1);
        const a3 = lerpP(lerpP(tL, tS, 1 - inH2 - 0.06), lerpP(bL, bS, 1 - inH2 - 0.06), t2);
        const a4 = lerpP(lerpP(tL, tS, inH2 + 0.06), lerpP(bL, bS, inH2 + 0.06), t2);
        g.poly([a1.x, a1.y, a2.x, a2.y, a3.x, a3.y, a4.x, a4.y])
          .fill(0x6b4220)
          .stroke({ width: 0.4, color: 0x3d2818 });
      };
      painel(inV2 + 0.06, 0.46);
      painel(0.54, 1 - inV2 - 0.06);
      // Maçaneta
      const mac = lerpP(lerpP(tL, tS, 1 - inH2 - 0.05), lerpP(bL, bS, 1 - inH2 - 0.05), 0.52);
      g.circle(mac.x, mac.y, 1.6).fill(0xf0c040).stroke({ width: 0.3, color: 0x6b4a10 });
    }

    // Cantos (encontro das paredes)
    drawCaixa(-1, -1, 1, 1, ALTURA_PAREDE, corTopo, corFrenteO, corFrenteE);
    drawCaixa(COLUNAS, -1, 1, 1, ALTURA_PAREDE, corTopo, corFrenteO, corFrenteE);

    // ============ SALA PRIVATIVA — MENTORIA (canto NO) ============
    // Parede leste da sala (col 6, lin 0-6) com vão de porta em lin 5-6
    const MURO_INTERNO_ALT = 28;
    const corMuroT = 0x7a5a3e;
    const corMuroE = 0x5a3e28;
    const corMuroD = 0x6b4a30;
    drawCaixa(6, 0, 1, 5, MURO_INTERNO_ALT, corMuroT, corMuroE, corMuroD);
    // Parede sul da sala (lin 6, col 0-5) com vão em col 5-6
    drawCaixa(0, 6, 5, 1, MURO_INTERNO_ALT, corMuroT, corMuroE, corMuroD);
    // Umbral da porta interna (baixo)
    drawCaixa(6, 5, 1, 2, 6, 0x8a6a48, 0x4a3220, 0x5a3e28);
    // Folha de porta do escritório do Mentor — na face room-facing (oeste) da
    // parede interna leste (col 6), preenchendo o vão (lin 5).
    {
      const { topo: tB, base: bB } = pontosTopoBox(6, 5, 1, 1, MURO_INTERNO_ALT);
      const tO = { x: tB[6], y: tB[7] };
      const tS = { x: tB[4], y: tB[5] };
      const bS = { x: bB[4], y: bB[5] };
      const bO = { x: bB[6], y: bB[7] };
      const lp = (a: {x:number;y:number}, b: {x:number;y:number}, t: number) =>
        ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const iH = 0.12, iV = 0.08;
      const f1 = lp(lp(tO, tS, iH),     lp(bO, bS, iH),     iV);
      const f2 = lp(lp(tO, tS, 1 - iH), lp(bO, bS, 1 - iH), iV);
      const f3 = lp(lp(tO, tS, 1 - iH), lp(bO, bS, 1 - iH), 1 - iV);
      const f4 = lp(lp(tO, tS, iH),     lp(bO, bS, iH),     1 - iV);
      g.poly([f1.x, f1.y, f2.x, f2.y, f3.x, f3.y, f4.x, f4.y])
        .fill(0x8b5a2b)
        .stroke({ width: 0.6, color: 0x2a1a10 });
      // Painel central + maçaneta
      const a1 = lp(lp(tO, tS, iH + 0.06), lp(bO, bS, iH + 0.06), iV + 0.06);
      const a2 = lp(lp(tO, tS, 1 - iH - 0.06), lp(bO, bS, 1 - iH - 0.06), iV + 0.06);
      const a3 = lp(lp(tO, tS, 1 - iH - 0.06), lp(bO, bS, 1 - iH - 0.06), 1 - iV - 0.06);
      const a4 = lp(lp(tO, tS, iH + 0.06), lp(bO, bS, iH + 0.06), 1 - iV - 0.06);
      g.poly([a1.x, a1.y, a2.x, a2.y, a3.x, a3.y, a4.x, a4.y])
        .fill(0x6b4220).stroke({ width: 0.4, color: 0x3d2818 });
      const mac = lp(lp(tO, tS, 1 - iH - 0.04), lp(bO, bS, 1 - iH - 0.04), 0.52);
      g.circle(mac.x, mac.y, 1.4).fill(0xf0c040).stroke({ width: 0.3, color: 0x6b4a10 });
    }

    // JANELAS na parede OESTE (mesma reta da porta) — paralelogramos
    // encaixados na face FRENTE-DIREITA (a face que aponta pro interior
    // da sala). A face vai de topo-leste → topo-sul → base-sul → base-leste,
    // seguindo o eixo lin (a parede oeste é alta em lin).
    const janelasOeste = [4, 10, 16]; // lin (evita porta em PORTA.y=22)
    const insetH = 0.18;
    const insetV = 0.22;
    for (const lin of janelasOeste) {
      const { topo, base } = pontosTopoBox(-1, lin, 1, 1, ALTURA_PAREDE);
      // face frente-direita (room-facing) da parede oeste
      const tL = { x: topo[2], y: topo[3] }; // topo-leste
      const tS = { x: topo[4], y: topo[5] }; // topo-sul
      const bS = { x: base[4], y: base[5] }; // base-sul
      const bL = { x: base[2], y: base[3] }; // base-leste

      const lerp = (a: {x:number;y:number}, b: {x:number;y:number}, t: number) =>
        ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

      const p1 = lerp(lerp(tL, tS, insetH), lerp(bL, bS, insetH), insetV);
      const p2 = lerp(lerp(tL, tS, 1 - insetH), lerp(bL, bS, 1 - insetH), insetV);
      const p3 = lerp(lerp(tL, tS, 1 - insetH), lerp(bL, bS, 1 - insetH), 1 - insetV);
      const p4 = lerp(lerp(tL, tS, insetH), lerp(bL, bS, insetH), 1 - insetV);

      const expand = 0.04;
      const m1 = lerp(lerp(tL, tS, insetH - expand), lerp(bL, bS, insetH - expand), insetV - expand);
      const m2 = lerp(lerp(tL, tS, 1 - insetH + expand), lerp(bL, bS, 1 - insetH + expand), insetV - expand);
      const m3 = lerp(lerp(tL, tS, 1 - insetH + expand), lerp(bL, bS, 1 - insetH + expand), 1 - insetV + expand);
      const m4 = lerp(lerp(tL, tS, insetH - expand), lerp(bL, bS, insetH - expand), 1 - insetV + expand);
      g.poly([m1.x, m1.y, m2.x, m2.y, m3.x, m3.y, m4.x, m4.y])
        .fill(0x2a1a10)
        .stroke({ width: 0.5, color: 0x000000, alpha: 0.6 });

      g.poly([p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y])
        .fill(0x8ec5e8)
        .stroke({ width: 0.6, color: 0x1a0f08 });

      const r1 = lerp(p1, p2, 0.55);
      const r2 = lerp(p1, p2, 0.85);
      const r3 = lerp(p4, p3, 0.95);
      const r4 = lerp(p4, p3, 0.65);
      g.poly([r1.x, r1.y, r2.x, r2.y, r3.x, r3.y, r4.x, r4.y])
        .fill({ color: 0xffffff, alpha: 0.18 });

      const midTop = lerp(p1, p2, 0.5);
      const midBot = lerp(p4, p3, 0.5);
      const midLef = lerp(p1, p4, 0.5);
      const midRig = lerp(p2, p3, 0.5);
      g.moveTo(midLef.x, midLef.y).lineTo(midRig.x, midRig.y)
        .stroke({ width: 1, color: 0x2a1a10 });
      g.moveTo(midTop.x, midTop.y).lineTo(midBot.x, midBot.y)
        .stroke({ width: 1, color: 0x2a1a10 });

      const s1 = lerp(lerp(tL, tS, insetH - expand - 0.02), lerp(bL, bS, insetH - expand - 0.02), 1 - insetV + expand + 0.01);
      const s2 = lerp(lerp(tL, tS, 1 - insetH + expand + 0.02), lerp(bL, bS, 1 - insetH + expand + 0.02), 1 - insetV + expand + 0.01);
      const s3 = lerp(lerp(tL, tS, 1 - insetH + expand + 0.02), lerp(bL, bS, 1 - insetH + expand + 0.02), 1 - insetV + expand + 0.06);
      const s4 = lerp(lerp(tL, tS, insetH - expand - 0.02), lerp(bL, bS, insetH - expand - 0.02), 1 - insetV + expand + 0.06);
      g.poly([s1.x, s1.y, s2.x, s2.y, s3.x, s3.y, s4.x, s4.y])
        .fill(0x3a2418);
    }

    // ============ OBJETOS NA PAREDE NORTE (paralelogramos) ============
    // Face room-facing da parede NORTE é a FRENTE-ESQUERDA:
    // topo-oeste → topo-sul → base-sul → base-oeste. Slope +HH/HW por col.
    type ObjParede = {
      col: number;
      w: number;
      tipo: "quadro-grande" | "quadro-pequeno" | "whiteboard" | "relogio";
    };
    const objsNorte: ObjParede[] = [
      { col: 2, w: 1, tipo: "whiteboard" },       // sala do Mentor (canto NO)
      { col: 9, w: 1, tipo: "quadro-pequeno" },
      { col: 17, w: 1, tipo: "relogio" },
      { col: 21, w: 1, tipo: "quadro-pequeno" },
      { col: 24, w: 2, tipo: "quadro-grande" },
      { col: 31, w: 1, tipo: "quadro-pequeno" },
    ];

    const lerpN = (a: {x:number;y:number}, b: {x:number;y:number}, t: number) =>
      ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

    for (const obj of objsNorte) {
      const { topo, base } = pontosTopoBox(obj.col, -1, obj.w, 1, ALTURA_PAREDE);
      const tO = { x: topo[6], y: topo[7] };
      const tS = { x: topo[4], y: topo[5] };
      const bS = { x: base[4], y: base[5] };
      const bO = { x: base[6], y: base[7] };

      const cfg = {
        "whiteboard":     { iH: 0.18, iV: 0.20, frame: 0x1a1a1a, glass: 0xf0f0e8, brilho: 0xffffff },
        "relogio":        { iH: 0.30, iV: 0.18, frame: 0x2a1a10, glass: 0xf5efe0, brilho: 0xffffff },
        "quadro-grande":  { iH: 0.10, iV: 0.18, frame: 0x4a2e18, glass: 0x6a8a52, brilho: 0xffe8a0 },
        "quadro-pequeno": { iH: 0.28, iV: 0.22, frame: 0x4a2e18, glass: 0x8a5a32, brilho: 0xffe8a0 },
      }[obj.tipo];

      const { iH, iV } = cfg;
      const p1 = lerpN(lerpN(tO, tS, iH),     lerpN(bO, bS, iH),     iV);
      const p2 = lerpN(lerpN(tO, tS, 1 - iH), lerpN(bO, bS, 1 - iH), iV);
      const p3 = lerpN(lerpN(tO, tS, 1 - iH), lerpN(bO, bS, 1 - iH), 1 - iV);
      const p4 = lerpN(lerpN(tO, tS, iH),     lerpN(bO, bS, iH),     1 - iV);

      const exp = 0.045;
      const m1 = lerpN(lerpN(tO, tS, iH - exp),     lerpN(bO, bS, iH - exp),     iV - exp);
      const m2 = lerpN(lerpN(tO, tS, 1 - iH + exp), lerpN(bO, bS, 1 - iH + exp), iV - exp);
      const m3 = lerpN(lerpN(tO, tS, 1 - iH + exp), lerpN(bO, bS, 1 - iH + exp), 1 - iV + exp);
      const m4 = lerpN(lerpN(tO, tS, iH - exp),     lerpN(bO, bS, iH - exp),     1 - iV + exp);
      g.poly([m1.x, m1.y, m2.x, m2.y, m3.x, m3.y, m4.x, m4.y])
        .fill(cfg.frame)
        .stroke({ width: 0.5, color: 0x000000, alpha: 0.6 });

      g.poly([p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y])
        .fill(cfg.glass)
        .stroke({ width: 0.5, color: 0x1a0f08 });

      const r1 = lerpN(p1, p2, 0.50);
      const r2 = lerpN(p1, p2, 0.80);
      const r3 = lerpN(p4, p3, 0.90);
      const r4 = lerpN(p4, p3, 0.60);
      g.poly([r1.x, r1.y, r2.x, r2.y, r3.x, r3.y, r4.x, r4.y])
        .fill({ color: cfg.brilho, alpha: 0.18 });

      if (obj.tipo === "whiteboard") {
        for (let k = 1; k <= 3; k++) {
          const tt = 0.22 + k * 0.18;
          const a = lerpN(p1, p4, tt);
          const b = lerpN(p2, p3, tt);
          const aa = lerpN(a, b, 0.08);
          const bb = lerpN(a, b, 0.55 + (k % 2) * 0.2);
          g.moveTo(aa.x, aa.y).lineTo(bb.x, bb.y).stroke({ width: 0.8, color: 0x2a4a8a });
        }
      } else if (obj.tipo === "relogio") {
        const c = lerpN(lerpN(p1, p2, 0.5), lerpN(p4, p3, 0.5), 0.5);
        const horario = lerpN(p1, p2, 0.5);
        const minuto = lerpN(p2, p3, 0.5);
        const h1 = lerpN(c, horario, 0.55);
        const m = lerpN(c, minuto, 0.7);
        g.moveTo(c.x, c.y).lineTo(h1.x, h1.y).stroke({ width: 1.2, color: 0x1a0f08 });
        g.moveTo(c.x, c.y).lineTo(m.x, m.y).stroke({ width: 0.9, color: 0x4a2e18 });
        g.circle(c.x, c.y, 0.9).fill(0x1a0f08);
      } else {
        const ip1 = lerpN(lerpN(tO, tS, iH + 0.02),     lerpN(bO, bS, iH + 0.02),     iV + 0.04);
        const ip2 = lerpN(lerpN(tO, tS, 1 - iH - 0.02), lerpN(bO, bS, 1 - iH - 0.02), iV + 0.04);
        const ip3 = lerpN(lerpN(tO, tS, 1 - iH - 0.02), lerpN(bO, bS, 1 - iH - 0.02), 1 - iV - 0.04);
        const ip4 = lerpN(lerpN(tO, tS, iH + 0.02),     lerpN(bO, bS, iH + 0.02),     1 - iV - 0.04);
        g.poly([ip1.x, ip1.y, ip2.x, ip2.y, ip3.x, ip3.y, ip4.x, ip4.y])
          .stroke({ width: 0.6, color: 0xfff4d0, alpha: 0.5 });
      }
    }
  }, []);

  // ============ HALO DA ESPERA (apenas vinheta de luz, sem tapete) ============
  const desenharTapete = useCallback((g: PixiGraphics) => {
    g.clear();
    // Vinheta muito sutil — só dá ancoragem visual à área de espera.
    const pts = pontosLosango(13, 11, 8, 5);
    g.poly(pts).fill({ color: 0xf5e8c8, alpha: 0.07 });
  }, []);

  // ============ DIVISÓRIAS BAIXAS DE VIDRO ============
  // Separa zona NORTE (atend/mentor/fin) da espera central e
  // zona SUL (vendas) da espera. Gesto arquitetônico discreto.
  const desenharDivisorias = useCallback((g: PixiGraphics) => {
    g.clear();
    const ALT = 9;
    const corBase = 0x2a2018;
    const corVidro = 0xb8d4dc;

    const trecho = (col: number, lin: number, w: number, h: number) => {
      const { topo, base } = pontosTopoBox(col, lin, w, h, ALT);
      // base de madeira escura
      g.poly([topo[6], topo[7], base[6], base[7], base[4], base[5], topo[4], topo[5]])
        .fill(corBase).stroke({ width: 0.4, color: 0x000000, alpha: 0.4 });
      g.poly([topo[2], topo[3], base[2], base[3], base[4], base[5], topo[4], topo[5]])
        .fill(0x352820).stroke({ width: 0.4, color: 0x000000, alpha: 0.4 });
      // topo (corrimão de vidro fosco)
      g.poly(topo).fill({ color: corVidro, alpha: 0.55 })
        .stroke({ width: 0.6, color: 0x1a0f08, alpha: 0.7 });
    };

    // Divisória NORTE da espera (separa atendimento/financeiro da espera)
    trecho(11, 8, 1, 2);
    trecho(15, 8, 1, 2);
    trecho(19, 8, 1, 2);

    // Divisória SUL da espera (separa vendas da espera)
    trecho(11, 16, 1, 1);
    trecho(15, 16, 1, 1);
    trecho(19, 16, 1, 1);

    // Divisória da copa (canto SO)
    trecho(8, 11, 1, 3);
  }, []);

  // ============ SOMBRAS DE CONTATO ============
  const desenharSombras = useCallback((g: PixiGraphics) => {
    g.clear();
    const sombra = (col: number, lin: number, rx: number, ry: number) => {
      const { x, y } = isoCentro(col, lin);
      g.ellipse(x, y, rx * 1.3, ry * 1.3).fill({ color: 0x000000, alpha: 0.10 });
      g.ellipse(x, y, rx, ry).fill({ color: 0x000000, alpha: 0.20 });
    };
    for (const est of ESTACOES) {
      // isoCentro(c, l) = centro do tile → ponto contínuo (c+0.5, l+0.5)
      sombra(est.x + 1, est.y - 0.1, 24, 9);  // bancada da cabine
      sombra(est.x + 1, est.y - 1, 6, 2.5);   // cadeira do atendente
    }
    // sofás (centro espera)
    sombra(15, 12.5, 16, 6);
    sombra(19, 12.5, 16, 6);
    sombra(17, 14, 9, 3.5);   // mesa de centro
    // plantas grandes
    sombra(0, 1, 7, 3);
    sombra(13, 11, 7, 3);
    sombra(21, 11, 7, 3);
    sombra(38, 4, 7, 3);
    sombra(0, 19, 7, 3);
    sombra(38, 19, 7, 3);
    // copa
    sombra(3, 12, 10, 4);
    sombra(2, 14, 5, 2);
    // estante (sala do mentor)
    sombra(3.5, 1, 12, 4);
  }, []);

  // ============ LUZES ============
  const desenharLuzes = useCallback((g: PixiGraphics) => {
    g.clear();
    for (const est of ESTACOES) {
      const { x, y } = isoCentro(est.x + 1, est.y - 0.5);
      g.circle(x, y - 6, 28).fill({ color: 0xffc870, alpha: 0.08 });
      g.circle(x, y - 6, 14).fill({ color: 0xffd890, alpha: 0.12 });
    }
    // luz fria/clara entrando pela porta (única luz ambiental restante)
    const porta = isoCentro(-0.5, PORTA.y + 0.5);
    g.circle(porta.x, porta.y, 44).fill({ color: 0xb5e07a, alpha: 0.12 });
  }, []);

  // ============ GLOW DOS NOTEBOOKS (animado) ============
  const desenharGlowTelas = useCallback((g: PixiGraphics) => {
    g.clear();
    const t = Date.now() / 1000;
    for (const est of ESTACOES) {
      const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.5 + est.x * 0.3));
      const { x, y } = isoCentro(est.x + 1, est.y - 0.35);
      g.circle(x, y - 16, 12).fill({ color: 0x4ab8ff, alpha: 0.10 * pulse });
      g.circle(x, y - 16, 6).fill({ color: 0x88d4ff, alpha: 0.18 * pulse });
    }
  }, []);

  // ============ SOFÁ ISO (caixa baixa em diagonal) ============
  const desenharSofaIso = useCallback((g: PixiGraphics, col: number, lin: number, w: number) => {
    g.clear();
    const ALT_BASE = 5;
    const ALT_ENCOSTO = 10;
    // base / assento
    const { topo: tAssento, base: bAssento } = pontosTopoBox(col, lin, w, 1, ALT_BASE);
    g.poly([tAssento[6], tAssento[7], bAssento[6], bAssento[7], bAssento[4], bAssento[5], tAssento[4], tAssento[5]])
      .fill(0x4a4030).stroke({ width: 0.4, color: 0x1a0f08, alpha: 0.6 });
    g.poly([tAssento[2], tAssento[3], bAssento[2], bAssento[3], bAssento[4], bAssento[5], tAssento[4], tAssento[5]])
      .fill(0x5a4a36).stroke({ width: 0.4, color: 0x1a0f08, alpha: 0.6 });
    g.poly(tAssento).fill(0x8a6a4a).stroke({ width: 0.5, color: 0x2a1410 });
    // encosto: faixa ao longo do lado NORTE (topo do diamante até leste→oeste)
    // desenha um box mais fino na metade norte, elevado
    const { topo: tEnc, base: bEnc } = pontosTopoBox(col, lin, w, 0.35, ALT_BASE + ALT_ENCOSTO);
    g.poly([tEnc[6], tEnc[7], bEnc[6], bEnc[7], bEnc[4], bEnc[5], tEnc[4], tEnc[5]])
      .fill(0x3a3024).stroke({ width: 0.4, color: 0x1a0f08, alpha: 0.6 });
    g.poly([tEnc[2], tEnc[3], bEnc[2], bEnc[3], bEnc[4], bEnc[5], tEnc[4], tEnc[5]])
      .fill(0x4a3e2e).stroke({ width: 0.4, color: 0x1a0f08, alpha: 0.6 });
    g.poly(tEnc).fill(0x6a5a44).stroke({ width: 0.5, color: 0x2a1410 });
  }, []);

  // ============ MESA DE CENTRO ISO (caixa baixa quadrada) ============
  const desenharMesaCentroIso = useCallback((g: PixiGraphics, col: number, lin: number) => {
    g.clear();
    const ALT = 6;
    const { topo, base } = pontosTopoBox(col, lin, 2, 1, ALT);
    g.poly([topo[6], topo[7], base[6], base[7], base[4], base[5], topo[4], topo[5]])
      .fill(0x2a1f18).stroke({ width: 0.4, color: 0x1a0f08, alpha: 0.6 });
    g.poly([topo[2], topo[3], base[2], base[3], base[4], base[5], topo[4], topo[5]])
      .fill(0x35261c).stroke({ width: 0.4, color: 0x1a0f08, alpha: 0.6 });
    g.poly(topo).fill(0x6a4a30).stroke({ width: 0.6, color: 0x1a0f08 });
  }, []);

  // ============ CADEIRA ISO (caixa baixa + encosto fino) ============
  // `lado`: "norte" → encosto na borda NORTE (cadeira do funcionário, olha pro sul);
  //         "sul"  → encosto na borda SUL (cadeira do cliente, olha pro norte).
  const desenharCadeiraIso = useCallback(
    (g: PixiGraphics, col: number, lin: number, lado: "norte" | "sul") => {
      g.clear();
      const ALT_BASE = 4;
      const ALT_ENCOSTO = 11;
      // assento (footprint pequeno — 0.7×0.7 centralizado no tile)
      const off = 0.15;
      const { topo: tA, base: bA } = pontosTopoBox(col + off, lin + off, 0.7, 0.7, ALT_BASE);
      g.poly([tA[6], tA[7], bA[6], bA[7], bA[4], bA[5], tA[4], tA[5]])
        .fill(0x232323).stroke({ width: 0.3, color: 0x0a0a0a, alpha: 0.7 });
      g.poly([tA[2], tA[3], bA[2], bA[3], bA[4], bA[5], tA[4], tA[5]])
        .fill(0x2e2e2e).stroke({ width: 0.3, color: 0x0a0a0a, alpha: 0.7 });
      g.poly(tA).fill(0x4a4a52).stroke({ width: 0.4, color: 0x1a1a1a });
      // encosto fino — alinhado ao lado correto
      const ec = lado === "norte"
        ? pontosTopoBox(col + off, lin + off, 0.7, 0.18, ALT_BASE + ALT_ENCOSTO)
        : pontosTopoBox(col + off, lin + off + 0.52, 0.7, 0.18, ALT_BASE + ALT_ENCOSTO);
      const { topo: tE, base: bE } = ec;
      g.poly([tE[6], tE[7], bE[6], bE[7], bE[4], bE[5], tE[4], tE[5]])
        .fill(0x161616).stroke({ width: 0.3, color: 0x000000, alpha: 0.7 });
      g.poly([tE[2], tE[3], bE[2], bE[3], bE[4], bE[5], tE[4], tE[5]])
        .fill(0x1e1e1e).stroke({ width: 0.3, color: 0x000000, alpha: 0.7 });
      g.poly(tE).fill(0x3a3a42).stroke({ width: 0.4, color: 0x1a1a1a });
    },
    [],
  );

  // ============ ESTANTE ISO (caixa alta com prateleiras) ============
  const desenharEstanteIso = useCallback(
    (g: PixiGraphics, col: number, lin: number, w: number) => {
      g.clear();
      const ALT = 22;
      const { topo, base } = pontosTopoBox(col, lin, w, 0.6, ALT);
      g.poly([topo[6], topo[7], base[6], base[7], base[4], base[5], topo[4], topo[5]])
        .fill(0x3a2818).stroke({ width: 0.4, color: 0x1a0f08 });
      g.poly([topo[2], topo[3], base[2], base[3], base[4], base[5], topo[4], topo[5]])
        .fill(0x4a3422).stroke({ width: 0.4, color: 0x1a0f08 });
      g.poly(topo).fill(0x5a4028).stroke({ width: 0.5, color: 0x1a0f08 });
      // 3 prateleiras na face leste (visível) — listras horizontais
      for (let i = 1; i <= 3; i++) {
        const ratio = i / 4;
        const y1 = topo[3] + (base[3] - topo[3]) * ratio;
        const y2 = topo[5] + (base[5] - topo[5]) * ratio;
        g.moveTo(topo[2], y1).lineTo(topo[4], y2)
          .stroke({ width: 0.6, color: 0x1a0f08, alpha: 0.8 });
        // livrinhos coloridos
        const cores = [0x8a3a3a, 0x3a6a8a, 0x8a7a3a, 0x3a8a5a];
        for (let k = 0; k < 4; k++) {
          const f = (k + 0.5) / 4;
          const lx = topo[2] + (topo[4] - topo[2]) * f;
          const ly = y1 + (y2 - y1) * f;
          g.rect(lx - 1, ly - 4, 1.8, 4).fill(cores[(i + k) % cores.length]);
        }
      }
    },
    [],
  );

  // ============ CAFETEIRA ISO (caixinha + bico) ============
  const desenharCafeteiraIso = useCallback((g: PixiGraphics, col: number, lin: number) => {
    g.clear();
    const ALT = 9;
    const { topo, base } = pontosTopoBox(col + 0.25, lin + 0.25, 0.5, 0.5, ALT);
    g.poly([topo[6], topo[7], base[6], base[7], base[4], base[5], topo[4], topo[5]])
      .fill(0x2a2a2a).stroke({ width: 0.3, color: 0x0a0a0a });
    g.poly([topo[2], topo[3], base[2], base[3], base[4], base[5], topo[4], topo[5]])
      .fill(0x3a3a3a).stroke({ width: 0.3, color: 0x0a0a0a });
    g.poly(topo).fill(0x5a3a2a).stroke({ width: 0.4, color: 0x1a0f08 });
  }, []);

  // ============ LIXEIRA ISO (cilindro aproximado por caixa) ============
  const desenharLixeiraIso = useCallback((g: PixiGraphics, col: number, lin: number) => {
    g.clear();
    const ALT = 7;
    const { topo, base } = pontosTopoBox(col + 0.3, lin + 0.3, 0.4, 0.4, ALT);
    g.poly([topo[6], topo[7], base[6], base[7], base[4], base[5], topo[4], topo[5]])
      .fill(0x1f2a32).stroke({ width: 0.3, color: 0x0a0f12 });
    g.poly([topo[2], topo[3], base[2], base[3], base[4], base[5], topo[4], topo[5]])
      .fill(0x28353e).stroke({ width: 0.3, color: 0x0a0f12 });
    g.poly(topo).fill(0x121a20).stroke({ width: 0.4, color: 0x000000 });
  }, []);


  // ============ CABINE DE CALL CENTER ============
  // Coordenadas CONTÍNUAS do grid (mesmas da simulação): cabine ocupa
  // C est.x..est.x+3 × L est.y-1..est.y+1. Atendente senta em (x+1.5, y-0.5)
  // olhando pro SUL (monitor); lead encosta na divisória da frente (linha y+1).
  const ALT_BANCADA = 9;
  const ALT_DIVISORIA = 19;

  /** Caixa iso com 3 faces; `elev` sobe a caixa inteira (ex.: objeto na bancada). */
  const caixaIso = useCallback(
    (
      g: PixiGraphics,
      c: number, l: number, w: number, h: number, alt: number,
      cores: { topo: number; sul: number; leste: number },
      elev = 0, alphaTopo = 1,
    ) => {
      const { topo, base } = pontosTopoBox(c, l, w, h, alt);
      const up = (pts: number[]) => pts.map((v, i) => (i % 2 === 1 ? v - elev : v));
      const t = up(topo);
      const b = up(base);
      g.poly([t[6], t[7], b[6], b[7], b[4], b[5], t[4], t[5]])
        .fill(cores.sul).stroke({ width: 0.4, color: 0x0e0a08, alpha: 0.7 });
      g.poly([t[2], t[3], b[2], b[3], b[4], b[5], t[4], t[5]])
        .fill(cores.leste).stroke({ width: 0.4, color: 0x0e0a08, alpha: 0.7 });
      g.poly(t).fill({ color: cores.topo, alpha: alphaTopo }).stroke({ width: 0.5, color: 0x0e0a08, alpha: 0.7 });
      return t;
    },
    [],
  );

  /** Painel de divisória: tecido na cor do cargo + faixa de vidro fosco + trilho de alumínio. */
  const desenharDivisoria = useCallback(
    (g: PixiGraphics, c: number, l: number, w: number, h: number, cor: CorCabine) => {
      g.clear();
      const ALT_TECIDO = ALT_DIVISORIA - 5;
      caixaIso(g, c, l, w, h, ALT_TECIDO, { topo: cor.topo, sul: cor.sul, leste: cor.leste });
      caixaIso(g, c, l, w, h, 4, { topo: 0xd6e6ee, sul: 0x9fc3d2, leste: 0xb3d2de }, ALT_TECIDO, 0.9);
      caixaIso(g, c, l, w, h, 1, { topo: 0xe3e6ea, sul: 0xa9adb3, leste: 0xc3c7cc }, ALT_DIVISORIA - 1);
    },
    [caixaIso],
  );

  /** Bancada + monitor (tela pro atendente) + teclado + telefone + suporte de headset. */
  const desenharBancada = useCallback(
    (g: PixiGraphics, est: Estacao) => {
      g.clear();
      const x = est.x;
      const y = est.y;
      // tampo em "U" raso: bancada principal encostada na divisória da frente
      caixaIso(g, x + 0.12, y + 0.05, 2.76, 0.8, ALT_BANCADA, { topo: 0xd9d4c8, sul: 0x7d7568, leste: 0x938a7c });
      // gaveteiro sob a bancada (lado leste)
      caixaIso(g, x + 2.2, y + 0.15, 0.6, 0.6, ALT_BANCADA - 1, { topo: 0x55585e, sul: 0x3a3c41, leste: 0x46484e });
      const E = ALT_BANCADA;
      // teclado (perto do atendente = borda norte da bancada)
      caixaIso(g, x + 1.05, y + 0.1, 0.9, 0.22, 1, { topo: 0x2b2d31, sul: 0x16171a, leste: 0x1d1e21 }, E);
      // monitor: pé + tela. A face NORTE (a que o atendente vê) é a tela acesa;
      // a câmera iso enxerga as costas (sul) e a lateral leste.
      caixaIso(g, x + 1.42, y + 0.5, 0.16, 0.12, 4, { topo: 0x2a2a2e, sul: 0x1c1c20, leste: 0x232327 }, E);
      const tela = caixaIso(g, x + 0.95, y + 0.52, 1.1, 0.08, 11, { topo: 0x2e2f33, sul: 0x202125, leste: 0x18191c }, E + 3);
      // brilho da tela vazando pela borda superior (lado do atendente)
      g.poly([tela[0], tela[1], tela[2], tela[3]], false)
        .stroke({ width: 1.2, color: 0x6fc3ff, alpha: 0.85 });
      // telefone IP (oeste da bancada)
      caixaIso(g, x + 0.35, y + 0.25, 0.4, 0.3, 2, { topo: 0x33363b, sul: 0x1d1f22, leste: 0x26282c }, E);
      {
        const p = isoCentro(x + 0.05, y - 0.1);
        g.circle(p.x, p.y - E - 3, 1.1).fill({ color: 0x66ff99, alpha: 0.9 });
      }
      // suporte de headset (leste do monitor): haste + arco
      caixaIso(g, x + 2.25, y + 0.3, 0.1, 0.1, 7, { topo: 0x777b82, sul: 0x4a4d52, leste: 0x5c5f64 }, E);
      {
        const p = isoCentro(x + 1.8, y - 0.2);
        const arco: number[] = [];
        for (let k = 0; k <= 6; k++) {
          const a = Math.PI * (1 + k / 6);
          arco.push(p.x + Math.cos(a) * 3, p.y - E - 7 + Math.sin(a) * 3);
        }
        g.poly(arco, false).stroke({ width: 1.2, color: 0x1a1a1d });
        g.circle(p.x - 3, p.y - E - 6.5, 1.2).fill(0x1a1a1d);
        g.circle(p.x + 3, p.y - E - 6.5, 1.2).fill(0x1a1a1d);
      }
      // caneca
      caixaIso(g, x + 0.3, y + 0.62, 0.16, 0.16, 3, { topo: 0x6b2a1f, sul: 0xb8452f, leste: 0xc9532f }, E);
    },
    [caixaIso],
  );

  // ============ ITENS COM DEPTH SORT ============
  type ItemRender = {
    key: string;
    z: number;
    render: () => React.ReactElement;
  };

  const itens: ItemRender[] = useMemo(() => {
    const arr: ItemRender[] = [];

    ESTACOES.forEach((est, idx) => {
      const numero = idx + 1;
      const cor = COR_CABINE[est.cargo];
      const E = 0.12; // espessura da divisória

      // carpete da cabine (sempre embaixo de tudo da estação)
      arr.push({
        key: `${est.id}-piso`,
        z: est.x + est.y - 3,
        render: () => (
          <pixiGraphics
            key={`${est.id}-piso`}
            draw={(g) => {
              g.clear();
              const { base } = pontosTopoBox(est.x, est.y - 1, 3, 2, 0);
              g.poly(base).fill({ color: cor.piso, alpha: 0.55 }).stroke({ width: 0.5, color: 0x000000, alpha: 0.25 });
            }}
          />
        ),
      });

      // divisória OESTE (atrás na vista iso → desenha antes)
      arr.push({
        key: `${est.id}-divO`,
        z: est.x + est.y - 0.5,
        render: () => (
          <pixiGraphics key={`${est.id}-divO`} draw={(g) => desenharDivisoria(g, est.x, est.y - 1, E, 2, cor)} />
        ),
      });

      // cadeira do atendente (dentro da cabine, encosto no NORTE → olha pro monitor)
      arr.push({
        key: `${est.id}-chairFunc`,
        z: est.x + est.y + 1,
        render: () => (
          <pixiGraphics
            key={`${est.id}-chairFunc`}
            draw={(g) => desenharCadeiraIso(g, est.x + 1, est.y - 1, "norte")}
          />
        ),
      });

      // bancada com monitor, telefone e headset
      arr.push({
        key: `${est.id}-desk`,
        z: est.x + est.y + 2,
        render: () => (
          <pixiGraphics key={`${est.id}-desk`} draw={(g) => desenharBancada(g, est)} />
        ),
      });

      // divisória da FRENTE (sul) + plaquinha com o número da cabine
      arr.push({
        key: `${est.id}-divS`,
        z: est.x + est.y + 2.45,
        render: () => {
          const placa = isoCentro(est.x + 1, est.y + 0.45);
          return (
            <pixiContainer key={`${est.id}-divS`}>
              <pixiGraphics draw={(g) => desenharDivisoria(g, est.x, est.y + 1 - E, 3, E, cor)} />
              <pixiContainer x={placa.x} y={placa.y - ALT_DIVISORIA - 6}>
                <pixiGraphics
                  draw={(g) => {
                    g.clear();
                    g.roundRect(-13, -7, 26, 12, 2)
                      .fill(0x1a1a1f)
                      .stroke({ width: 1, color: 0xe8c976 });
                    g.roundRect(-12, -6, 24, 10, 1.5)
                      .stroke({ width: 0.4, color: 0xf5d98a, alpha: 0.6 });
                  }}
                />
                <pixiText
                  text={`#${numero}`}
                  x={0}
                  y={-1}
                  anchor={0.5}
                  resolution={4}
                  style={{
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: 9,
                    fill: 0xf5d98a,
                    fontWeight: "700",
                    letterSpacing: 0.5,
                  }}
                />
              </pixiContainer>
            </pixiContainer>
          );
        },
      });

      // divisória LESTE (na frente na vista iso → desenha depois)
      arr.push({
        key: `${est.id}-divL`,
        z: est.x + est.y + 2.9,
        render: () => (
          <pixiGraphics key={`${est.id}-divL`} draw={(g) => desenharDivisoria(g, est.x + 3 - E, est.y - 1, E, 2, cor)} />
        ),
      });
    });

    // Decorações
    DECORACOES.forEach((d, i) => {
      const w = d.w ?? 1;
      const h = d.h ?? 1;
      const cx = d.x + (w - 1) / 2;
      const cy = d.y + (h - 1) / 2;
      const animavel =
        d.textura === "largePlant" ||
        d.textura === "plant2" ||
        d.textura === "plantTall" ||
        d.textura === "hangingPlant" ||
        d.textura === "cactus";
      const pendurada = d.textura === "hangingPlant";
      // Tapete e mesa redonda: sprites "deitados" no chão — anchor no centro.
      const deitado =
        d.textura === "rugPersian" ||
        d.textura === "roundTable";
      // Itens fixados na PAREDE NORTE: desenhados em desenharParedes.
      const naParede =
        d.textura === "whiteboard" ||
        d.textura === "clock" ||
        d.textura === "largePainting" ||
        d.textura === "smallPainting";
      if (naParede) return;

      // Sofá: substitui sprite top-down por caixa iso procedural
      if (d.textura === "sofaFront") {
        arr.push({
          key: `dec-${i}`,
          z: d.x + d.y + (w - 1) / 2,
          render: () => (
            <pixiGraphics key={`dec-${i}`} draw={(g) => desenharSofaIso(g, d.x, d.y, w)} />
          ),
        });
        return;
      }

      // Mesa de centro: caixa iso baixa
      if (d.textura === "coffeeTable") {
        arr.push({
          key: `dec-${i}`,
          z: d.x + d.y + 0.3,
          render: () => (
            <pixiGraphics key={`dec-${i}`} draw={(g) => desenharMesaCentroIso(g, d.x, d.y)} />
          ),
        });
        return;
      }

      // Estante alta: caixa iso vertical com prateleiras
      if (d.textura === "doubleBookshelf") {
        arr.push({
          key: `dec-${i}`,
          z: d.x + d.y,
          render: () => (
            <pixiGraphics key={`dec-${i}`} draw={(g) => desenharEstanteIso(g, d.x, d.y, w)} />
          ),
        });
        return;
      }

      // Cafeteira / lixo: caixinhas iso
      if (d.textura === "coffee") {
        arr.push({
          key: `dec-${i}`,
          z: d.x + d.y,
          render: () => (
            <pixiGraphics key={`dec-${i}`} draw={(g) => desenharCafeteiraIso(g, d.x, d.y)} />
          ),
        });
        return;
      }
      if (d.textura === "bin") {
        arr.push({
          key: `dec-${i}`,
          z: d.x + d.y,
          render: () => (
            <pixiGraphics key={`dec-${i}`} draw={(g) => desenharLixeiraIso(g, d.x, d.y)} />
          ),
        });
        return;
      }
      arr.push({
        key: `dec-${i}`,
        z: cx + cy + (pendurada ? -3 : 0) + (d.textura === "rugPersian" ? -5 : 0),
        render: () => {
          const t = Date.now() / 1000;
          const fase = (i * 1.37) % (Math.PI * 2);
          const sway = animavel ? Math.sin(t * 1.2 + fase) * 0.025 : 0;
          // Pendurada: fixada na FACE da parede norte (vaso no alto, folhas
          // descendo). Antes era objeto de chão com offset → parecia "flutuar
          // em cima da parede". Agora ancora no topo da parede (anchor topo).
          if (pendurada) {
            const p = tileBaseIso(d.x, 0);
            return (
              <pixiSprite
                key={`dec-${i}`}
                texture={texturas[d.textura] as Texture}
                x={p.x}
                y={p.y - ALTURA_PAREDE - 8}
                anchor={{ x: 0.5, y: 0 }}
                rotation={sway}
              />
            );
          }
          const { x, y } = tileBaseIso(cx, cy);
          const anchorY = deitado ? 0.5 : 1;
          return (
            <pixiSprite
              key={`dec-${i}`}
              texture={texturas[d.textura] as Texture}
              x={x}
              y={y}
              anchor={{ x: 0.5, y: anchorY }}
              rotation={sway}
            />
          );
        },
      });
    });

    arr.sort((a, b) => a.z - b.z);
    return arr;
  }, [texturas, desenharDivisoria, desenharBancada, desenharSofaIso, desenharMesaCentroIso, desenharCadeiraIso, desenharEstanteIso, desenharCafeteiraIso, desenharLixeiraIso]);

  return (
    <pixiContainer>
      <pixiGraphics draw={desenharChao} />
      <pixiGraphics draw={desenharTapete} />
      <pixiGraphics draw={desenharSombras} />
      <pixiGraphics draw={desenharLuzes} blendMode="add" />
      <pixiGraphics draw={desenharParedes} />
      <pixiGraphics draw={desenharDivisorias} />
      {itens.map((it) => it.render())}
      <pixiGraphics draw={desenharGlowTelas} blendMode="add" />
    </pixiContainer>
  );
}

export { ESTACOES, DECORACOES };
export { zonaDoTile, corDoChao };
export type { Movel, Estacao };

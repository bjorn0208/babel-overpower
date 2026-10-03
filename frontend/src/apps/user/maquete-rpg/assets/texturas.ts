/**
 * Catálogo de texturas da maquete.
 *
 * Centraliza imports dos PNGs (vendorados em ./sprites — veja CREDITS.md)
 * e fornece um loader que retorna um dicionário Texture pronto pro Pixi.
 *
 * Tudo passa pelo Vite como URL (`?url`-implícito em PNG), então o build
 * empacota só os sprites efetivamente referenciados.
 */
import { Assets, type Texture } from "pixi.js";

import floor0 from "./sprites/floors/floor_0.png";
import floor1 from "./sprites/floors/floor_1.png";

import wall0 from "./sprites/walls/wall_0.png";

import deskFront from "./sprites/furniture/DESK/DESK_FRONT.png";
import pcFrontOn from "./sprites/furniture/PC/PC_FRONT_ON_1.png";
import pcBack from "./sprites/furniture/PC/PC_BACK.png";
import chairBack from "./sprites/furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK.png";
import chairFront from "./sprites/furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png";
import sofaFront from "./sprites/furniture/SOFA/SOFA_FRONT.png";
import sofaSide from "./sprites/furniture/SOFA/SOFA_SIDE.png";
import plant from "./sprites/furniture/PLANT/PLANT.png";
import plant2 from "./sprites/furniture/PLANT_2/PLANT_2.png";
import largePlant from "./sprites/furniture/LARGE_PLANT/LARGE_PLANT.png";
import cactus from "./sprites/furniture/CACTUS/CACTUS.png";
import whiteboard from "./sprites/furniture/WHITEBOARD/WHITEBOARD.png";
import coffee from "./sprites/furniture/COFFEE/COFFEE.png";
import coffeeTable from "./sprites/furniture/COFFEE_TABLE/COFFEE_TABLE.png";
import bookshelf from "./sprites/furniture/BOOKSHELF/BOOKSHELF.png";
import doubleBookshelf from "./sprites/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png";
import smallPainting from "./sprites/furniture/SMALL_PAINTING/SMALL_PAINTING.png";
import smallPainting2 from "./sprites/furniture/SMALL_PAINTING_2/SMALL_PAINTING_2.png";
import largePainting from "./sprites/furniture/LARGE_PAINTING/LARGE_PAINTING.png";
import clock from "./sprites/furniture/CLOCK/CLOCK.png";
import hangingPlant from "./sprites/furniture/HANGING_PLANT/HANGING_PLANT.png";
import bin from "./sprites/furniture/BIN/BIN.png";
import pot from "./sprites/furniture/POT/POT.png";

// === Sprites ISO CC0 (hawkbirdtree, OpenGameArt) ===
import rugPersian from "./sprites/iso-cc0/rug-persian.png";
import plantTall from "./sprites/iso-cc0/plant-tall.png";
import roundTable from "./sprites/iso-cc0/round-table.png";
import bookshelfIso from "./sprites/iso-cc0/bookshelf-iso.png";

import char0 from "./sprites/characters/char_0.png";
import char1 from "./sprites/characters/char_1.png";
import char2 from "./sprites/characters/char_2.png";
import char3 from "./sprites/characters/char_3.png";
import char4 from "./sprites/characters/char_4.png";
import char5 from "./sprites/characters/char_5.png";
// Variações de lead (hue-shift sobre char_5/char_0/char_3) — geradas em build local.
import lead0 from "./sprites/characters/char_lead_30.png";
import lead1 from "./sprites/characters/char_lead_70.png";
import lead2 from "./sprites/characters/char_lead_120.png";
import lead3 from "./sprites/characters/char_lead_180.png";
import lead4 from "./sprites/characters/char_lead_200.png";
import lead5 from "./sprites/characters/char_lead_240.png";
import lead6 from "./sprites/characters/char_lead_300.png";
import lead7 from "./sprites/characters/char_lead_330.png";
import lead8 from "./sprites/characters/char_0_lead_60.png";
import lead9 from "./sprites/characters/char_0_lead_200.png";
import lead10 from "./sprites/characters/char_0_lead_320.png";
import lead11 from "./sprites/characters/char_3_lead_60.png";
import lead12 from "./sprites/characters/char_3_lead_200.png";
import lead13 from "./sprites/characters/char_3_lead_320.png";

export const URLS = {
  floor0,
  floor1,
  wall0,
  deskFront,
  pcFrontOn,
  pcBack,
  chairBack,
  chairFront,
  sofaFront,
  sofaSide,
  plant,
  plant2,
  largePlant,
  cactus,
  whiteboard,
  coffee,
  coffeeTable,
  bookshelf,
  doubleBookshelf,
  smallPainting,
  smallPainting2,
  largePainting,
  clock,
  hangingPlant,
  bin,
  pot,
  rugPersian,
  plantTall,
  roundTable,
  bookshelfIso,
  char0,
  char1,
  char2,
  char3,
  char4,
  char5,
  lead0,
  lead1,
  lead2,
  lead3,
  lead4,
  lead5,
  lead6,
  lead7,
  lead8,
  lead9,
  lead10,
  lead11,
  lead12,
  lead13,
} as const;

export type ChaveTextura = keyof typeof URLS;

export type CatalogoTexturas = Record<ChaveTextura, Texture>;

let cache: CatalogoTexturas | null = null;
let promessa: Promise<CatalogoTexturas> | null = null;

/**
 * Carrega todas as texturas (cacheado). Pixi v8 desabilita smoothing
 * automaticamente quando o asset é PNG sem mipmaps — o resultado fica
 * crisp pixel-art sem precisar setar SCALE_MODE manualmente aqui.
 */
export function carregarTexturas(): Promise<CatalogoTexturas> {
  if (cache) return Promise.resolve(cache);
  if (promessa) return promessa;
  promessa = (async () => {
    const entries = Object.entries(URLS) as [ChaveTextura, string][];
    const pares = await Promise.all(
      entries.map(async ([k, u]) => {
        const tex = (await Assets.load(u)) as Texture;
        // pixel-art crisp
        tex.source.scaleMode = "nearest";
        return [k, tex] as const;
      }),
    );
    cache = Object.fromEntries(pares) as CatalogoTexturas;
    return cache;
  })();
  return promessa;
}

// Pré-aquece o cache assim que o módulo é importado (acontece no boot do
// desktop, pois bundle.jsx importa MaqueteRpg estaticamente). Quando o usuário
// abrir a maquete, as texturas já estarão prontas — abertura ~instantânea.
// Roda só no browser; ignora erros silenciosamente (o open real reporta).
if (typeof window !== "undefined") {
  // microtask pra não bloquear avaliação do módulo
  Promise.resolve().then(() => {
    carregarTexturas().catch(() => {
      /* silencioso — o componente trata o erro no open real */
    });
  });
}

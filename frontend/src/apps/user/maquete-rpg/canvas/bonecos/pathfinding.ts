/**
 * Pathfinding A* no grid de tiles da maquete.
 *
 * A* com heurística manhattan + penalidade leve de virada — produz rotas
 * curtas e VISUALMENTE diretas (sem zig-zag aleatório). Grid binário
 * livre/bloqueado, sem diagonais. 40×25 = 1000 nós, instantâneo.
 */

import { COLUNAS, LINHAS } from "../MapaEmpresa";

export type Tile = { x: number; y: number };

export type Grid = boolean[][]; // grid[x][y] = true se livre

/** Constrói um grid livre e marca obstáculos a partir de uma lista. */
export function construirGrid(obstaculos: Tile[]): Grid {
  const g: Grid = Array.from({ length: COLUNAS }, () =>
    Array.from({ length: LINHAS }, () => true),
  );
  for (const o of obstaculos) {
    if (o.x >= 0 && o.x < COLUNAS && o.y >= 0 && o.y < LINHAS) {
      g[o.x][o.y] = false;
    }
  }
  return g;
}

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
  dir: number; // 0..3 ou -1
}

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

/** A* retornando lista de tiles do início (exclusivo) ao destino (inclusivo). */
export function caminho(grid: Grid, origem: Tile, destino: Tile): Tile[] | null {
  if (origem.x === destino.x && origem.y === destino.y) return [];
  const h = (x: number, y: number) =>
    Math.abs(x - destino.x) + Math.abs(y - destino.y);

  const aberto: Node[] = [];
  const melhorG: number[][] = Array.from({ length: COLUNAS }, () =>
    Array(LINHAS).fill(Infinity),
  );
  const inicial: Node = {
    x: origem.x,
    y: origem.y,
    g: 0,
    f: h(origem.x, origem.y),
    parent: null,
    dir: -1,
  };
  aberto.push(inicial);
  melhorG[origem.x][origem.y] = 0;

  while (aberto.length) {
    // remove o de menor f (lista pequena → linear basta)
    let idx = 0;
    for (let i = 1; i < aberto.length; i++) {
      if (aberto[i].f < aberto[idx].f) idx = i;
    }
    const atual = aberto.splice(idx, 1)[0];
    if (atual.x === destino.x && atual.y === destino.y) {
      const cam: Tile[] = [];
      let cur: Node | null = atual;
      while (cur && cur.parent) {
        cam.unshift({ x: cur.x, y: cur.y });
        cur = cur.parent;
      }
      return cam;
    }
    for (let d = 0; d < 4; d++) {
      const { dx, dy } = DIRS[d];
      const nx = atual.x + dx;
      const ny = atual.y + dy;
      if (nx < 0 || nx >= COLUNAS || ny < 0 || ny >= LINHAS) continue;
      // destino pode ser ocupado (cadeira em frente à mesa)
      const ehDestino = nx === destino.x && ny === destino.y;
      if (!ehDestino && !grid[nx][ny]) continue;
      // penaliza leve quando muda de direção → caminho com menos curvas
      const penalidadeTurn = atual.dir === -1 || atual.dir === d ? 0 : 0.4;
      const novoG = atual.g + 1 + penalidadeTurn;
      if (novoG >= melhorG[nx][ny]) continue;
      melhorG[nx][ny] = novoG;
      aberto.push({
        x: nx,
        y: ny,
        g: novoG,
        f: novoG + h(nx, ny),
        parent: atual,
        dir: d,
      });
    }
  }
  return null;
}

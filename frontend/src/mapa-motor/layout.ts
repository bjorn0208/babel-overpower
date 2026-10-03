// Layout automático para o grafo do motor via dagre
// Evita posicionamento manual de 42 nós

import dagre from "@dagrejs/dagre";
import { Position, MarkerType, type Node, type Edge } from "@xyflow/react";
import type { NoMotorDados, ArestaMotorDados, FiltroCanal } from "./tipos";

const LARGURA_NO = 280;
const ALTURA_NO = 90;

// Cores por canal — OKLch para consistência com design tokens do projeto
export const COR_CANAL: Record<string, string> = {
  externo: "oklch(0.55 0.18 240)", // azul
  interno: "oklch(0.50 0.18 290)", // roxo
  ambos: "oklch(0.50 0.16 165)",   // verde-azulado
};

export const COR_CANAL_BORDA: Record<string, string> = {
  externo: "oklch(0.45 0.20 240)",
  interno: "oklch(0.40 0.20 290)",
  ambos: "oklch(0.40 0.18 165)",
};

export const LABEL_CANAL: Record<string, string> = {
  externo: "Conversas",
  interno: "Mentor/Admin",
  ambos: "Ambos",
};

function noElegivel(canal: string, filtro: FiltroCanal): boolean {
  if (filtro === "todos") return true;
  if (canal === "ambos") return true;
  return canal === filtro;
}

export function construirGrafoReactFlow(
  nosRaw: NoMotorDados[],
  arestasRaw: ArestaMotorDados[],
  filtro: FiltroCanal
): { nodes: Node[]; edges: Edge[] } {
  // Filtra nós elegíveis pelo canal
  const nosElegiveis = nosRaw.filter((n) => noElegivel(n.canal, filtro));
  const idsElegiveis = new Set(nosElegiveis.map((n) => n.id));

  // Filtra arestas cujos dois extremos estão no conjunto elegível
  const arestasElegiveis = arestasRaw.filter(
    (e) => idsElegiveis.has(e.from) && idsElegiveis.has(e.to)
  );

  // Configura dagre
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",   // esquerda → direita: linha do tempo do fluxo, leitura natural
    nodesep: 48,     // separação vertical entre nós do mesmo nível
    ranksep: 160,    // separação horizontal entre etapas (espaço pra label da aresta)
    marginx: 48,
    marginy: 48,
  });

  nosElegiveis.forEach((no) => {
    g.setNode(no.id, { width: LARGURA_NO, height: ALTURA_NO });
  });

  arestasElegiveis.forEach((aresta) => {
    g.setEdge(aresta.from, aresta.to);
  });

  dagre.layout(g);

  // Constrói nodes React Flow
  const nodes: Node[] = nosElegiveis.map((no) => {
    const pos = g.node(no.id);
    return {
      id: no.id,
      type: "noMotor",
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      position: {
        x: pos.x - LARGURA_NO / 2,
        y: pos.y - ALTURA_NO / 2,
      },
      data: {
        label: no.label,
        canal: no.canal,
        faz: no.faz,
        ativa_proximo: no.ativa_proximo,
        fonte_dado_real: no.fonte_dado_real,
        ref: no.ref,
      },
      style: { width: LARGURA_NO },
    };
  });

  // Constrói edges React Flow
  const edges: Edge[] = arestasElegiveis.map((aresta, i) => ({
    id: `e-${aresta.from}-${aresta.to}-${i}`,
    source: aresta.from,
    target: aresta.to,
    label: aresta.label,
    type: "smoothstep",
    pathOptions: { borderRadius: 14 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: "oklch(0.62 0.06 240)",
    },
    style: { stroke: "oklch(0.6 0.05 240)", strokeWidth: 1.5 },
    labelStyle: {
      fontSize: 11,
      fill: "oklch(0.7 0.03 240)",
    },
    labelBgStyle: {
      fill: "oklch(0.15 0.02 240)",
      fillOpacity: 0.85,
    },
  }));

  return { nodes, edges };
}

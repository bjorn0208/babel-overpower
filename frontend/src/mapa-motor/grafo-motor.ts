// Índice do grafo do motor vivo
// Dados separados em grafo-nos.ts (nós) e grafo-arestas.ts (arestas)
// para respeitar o limite de 300 linhas por arquivo

import type { GrafoMotor } from "./tipos";
import { NOS_MOTOR } from "./grafo-nos";
import { ARESTAS_MOTOR } from "./grafo-arestas";

export const GRAFO_MOTOR: GrafoMotor = {
  meta: {
    gerado_em: "2026-05-18",
    fonte:
      "Serena read_file — ragentic-processar-inline/index.ts (~1860L), webhook/index.ts, processar-acompanhamentos/index.ts + outbox-consumer.ts, _shared/canal-interno.ts, _shared/recall-memoria.ts, _shared/diretriz-bolha.ts, _shared/tools-internas.ts, _shared/tools-mentor.ts, bundle.jsx",
    modelos: {
      porteiro: "google/gemma-4-31b-it",
      sintese: "google/gemini-3.1-flash-lite",
      extrator: "google/gemma-4-31b-it",
      interno: "google/gemini-3.1-flash-lite",
    },
  },
  nodes: NOS_MOTOR,
  edges: ARESTAS_MOTOR,
};

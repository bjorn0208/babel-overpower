// As 6 regiões do "cérebro" + ordem real de montagem do System Prompt.
// Ordem confirmada na fonte viva (ragentic-processar-inline/index.ts, var `sistemaBase`):
// temporal → identidade → bussola → diretrizes → empatia → crenca → fatos →
// episodios → pensamento → ema → [rodapé fixo: Hierarquia de Verdade] → + rag (no fim)

import type { RegiaoCerebro, BlocosPrompt, ChaveBloco } from "./tipos-construcao";

export const REGIOES: RegiaoCerebro[] = [
  {
    id: "tempo-identidade",
    titulo: "Tempo & Identidade",
    resumo: "Quando é agora e quem o agente é (nome, tom).",
    chaves: ["temporal", "identidade"],
    hue: 230,
  },
  {
    id: "cargo-regras",
    titulo: "Cargo & Regras",
    resumo: "Qual o papel ativo, o objetivo (bússola), as regras e a empatia calibrada.",
    chaves: ["bussola", "diretrizes", "empatia"],
    hue: 285,
  },
  {
    id: "crenca-e-lead",
    titulo: "Crença & o Lead",
    resumo:
      "O que o agente acredita da conversa + o que sabe da pessoa (fatos, episódios). Segmento contíguo da ordem real do motor.",
    chaves: ["crenca", "fatos", "episodios"],
    hue: 200,
  },
  {
    id: "plano-compromissos",
    titulo: "Plano & Compromissos",
    resumo: "A intenção do próximo passo e os compromissos já ativos do lead.",
    chaves: ["pensamento", "ema"],
    hue: 145,
  },
  {
    id: "conhecimento-rag",
    titulo: "Conhecimento (RAG)",
    resumo: "O que foi puxado da base (texto + vetor + rerank, escopo tenant/nicho/global).",
    chaves: ["rag"],
    hue: 60,
  },
  {
    id: "prompt-final",
    titulo: "Prompt Final",
    resumo: "A soma de tudo: o texto literal que foi enviado ao LLM.",
    chaves: [],
    hue: 25,
    ehFinal: true,
  },
];

/** Rótulo humano de cada bloco (pro chip/neurônio) */
export const ROTULO_BLOCO: Record<ChaveBloco, string> = {
  temporal: "Data/hora (BRT)",
  identidade: "Nome + tom do agente",
  bussola: "Objetivo + regras do cargo",
  diretrizes: "Diretrizes do cargo",
  empatia: "Calibragem de empatia",
  crenca: "Crença da conversa",
  fatos: "Fatos do lead",
  episodios: "Episódios passados",
  pensamento: "Intenção do turno",
  ema: "Compromissos ativos",
  rag: "Blocos de conhecimento",
};

/** true se o bloco veio com conteúdo real (não vazio) naquele turno */
export function blocoTemConteudo(blocos: BlocosPrompt | null, chave: ChaveBloco): boolean {
  if (!blocos) return false;
  const v = blocos[chave];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Texto acumulado do prompt até o passo `passoIdx` (inclusive).
 * Concatena os blocos das regiões já percorridas na ordem real de montagem.
 * A região final não soma blocos — ela exibe o prompt_completo cru.
 */
export function montarParcial(
  blocos: BlocosPrompt | null,
  passoIdx: number,
): string {
  if (!blocos || passoIdx < 0) return "";
  const partes: string[] = [];
  for (let i = 0; i <= passoIdx && i < REGIOES.length; i++) {
    const reg = REGIOES[i];
    if (reg.ehFinal) continue;
    for (const ch of reg.chaves) {
      const v = blocos[ch];
      if (typeof v === "string" && v.trim().length > 0) partes.push(v);
    }
  }
  return partes.join("");
}

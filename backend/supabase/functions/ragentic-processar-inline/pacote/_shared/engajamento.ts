/**
 * Calcula o engajamento do lead a partir de sinais que o motor já computa.
 * Puro/sem dep Deno (testável com tsx). Onda 2026-05-16 — `engajamento_lead`
 * era tabela morta de escrita; isto religa a barra do dossiê E o filtro de
 * retomada proativa (cron-varrer-gatilhos-temporais lia `nivel` e pulava todo
 * lead como "frio" por falta de registro).
 */
export type NivelEngajamento = "frio" | "morno" | "quente";
export type TendenciaEngajamento = "subindo" | "caindo" | "estavel";

export interface EntradaEngajamento {
  /** Score do lead 0-100 (já computado pelo motor a cada turno). */
  scoreLead: number;
  /** Média de caracteres das mensagens do lead no histórico. */
  comprimentoMedio: number;
  /** Pontuação do registro anterior (0-1) ou null se primeiro. */
  pontuacaoAnterior: number | null;
}

export interface ResultadoEngajamento {
  pontuacao: number; // 0-1 (CHECK lead_engagement_score_check)
  nivel: NivelEngajamento; // CHECK lead_engagement_nivel_check
  tendencia: TendenciaEngajamento; // CHECK lead_engagement_tendencia_check
  comprimento_medio: number;
}

export function calcularEngajamento(e: EntradaEngajamento): ResultadoEngajamento {
  const score = Number(e.scoreLead);
  const pontuacao = Math.max(0, Math.min(1, Number.isFinite(score) ? score / 100 : 0));
  const nivel: NivelEngajamento =
    pontuacao >= 0.7 ? "quente" : pontuacao >= 0.4 ? "morno" : "frio";

  let tendencia: TendenciaEngajamento = "estavel";
  if (e.pontuacaoAnterior != null) {
    const d = pontuacao - Number(e.pontuacaoAnterior);
    tendencia = d > 0.05 ? "subindo" : d < -0.05 ? "caindo" : "estavel";
  }

  const cm = Number(e.comprimentoMedio);
  const comprimento_medio = Math.max(0, Math.round(Number.isFinite(cm) ? cm : 0));

  return { pontuacao, nivel, tendencia, comprimento_medio };
}

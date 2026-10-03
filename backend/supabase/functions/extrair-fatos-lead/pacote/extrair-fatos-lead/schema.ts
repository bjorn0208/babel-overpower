/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { z } from "npm:zod@3";

// ---------------------------------------------------------------------------
// Categorias de fatos — alinhadas com vocabulário do curador nos 5 RAGs.
// Fonte: agent-output/analises/wave0-cognitivo-contrato-extractor-2026-04-20.md §1
// NÃO usar string livre — campo filtrável e indexável.
// ---------------------------------------------------------------------------
export const CategoriasLeadMemory = z.enum([
  "fato_biografico",       // profissão, família, moradia, estado civil
  "fato_financeiro",       // dívida, renda, capacidade de pagamento, nome sujo
  "objecao",               // resistência explicitamente verbalizada pelo lead
  "interesse",             // sinal de interesse em produto, condição ou prazo
  "historico_negociacao",  // experiências passadas com o produto, categoria ou concorrentes
]);

export type CategoriaLeadMemory = z.infer<typeof CategoriasLeadMemory>;

// ---------------------------------------------------------------------------
// Fato individual — 1 fato atômico extraído do turno.
// Granularidade atômica obrigatória: cada fato pode ser invalidado
// independentemente (Mem0 arXiv:2504.19413).
// ---------------------------------------------------------------------------
export const LeadFactSchema = z.object({
  fato: z
    .string()
    .min(10)
    .max(200)
    .describe(
      "Fato atômico sobre o lead, em linguagem declarativa, sem mencionar turno ou data. " +
      "Ex.: 'tem dois filhos', 'trabalha como autônomo', 'tem dívida no Serasa desde 2022'. " +
      "NUNCA incluir compromissos do agente aqui.",
    ),
  categoria: CategoriasLeadMemory,
  relevancia: z.enum(["alta", "media", "baixa"]).describe(
    "alta = informa diretamente tom de reabertura ou personalização de proposta. " +
    "media = contexto útil mas não crítico. baixa = ruído tolerável sem impacto de estratégia.",
  ),
  confianca: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Confiança do extractor. 1.0 = lead declarou explicitamente. " +
      "0.5–0.9 = inferido com contexto claro. < 0.5 = especulação — descartar via filtro.",
    ),
  valencia_emocional: z
    .number()
    .min(0)
    .max(1)
    .default(0)
    .describe(
      "Carga emocional do fato pra o lead. 0 = neutro/factual ('mora em SP', 'tem CNPJ'). " +
      "0.5 = moderada ('sonha comprar casa'). 1.0 = muito carregada ('cachorro morreu', 'medo de perder a casa'). " +
      "Fato emocional é lembrado mais forte mesmo meses depois — pontue com cuidado. Default 0.",
    ),
});

export type LeadFact = z.infer<typeof LeadFactSchema>;

// ---------------------------------------------------------------------------
// Sinais de engajamento — não são fatos sobre o lead, são sinais de
// estado da conversa neste turno. Alimentam delay e belief, não lead_memory.
// ---------------------------------------------------------------------------
export const TiposSinalEngajamento = z.enum([
  "velocidade_queda",       // lead demorou muito mais do que sua média
  "velocidade_alta",        // lead respondeu muito mais rápido do que sua média
  "mudanca_tom_positiva",   // lead ficou mais entusiasmado, usou mais pontuação/emojis
  "mudanca_tom_negativa",   // lead ficou mais frio, respostas encurtaram
  "objecao_detectada",      // lead verbalizou resistência explícita
  "interesse_crescente",    // lead fez perguntas de aprofundamento sem ser solicitado
  "sinais_desistencia",     // lead disse "depois", "vou pensar", parou de responder
]);

export const LeadSignalSchema = z.object({
  tipo: TiposSinalEngajamento,
  detalhe: z
    .string()
    .min(5)
    .max(150)
    .describe(
      "Descrição concisa do que observou. " +
      "Ex.: 'respondeu em 45min vs média de 3min', 'disse explicitamente que não tem dinheiro agora'.",
    ),
});

export type LeadSignal = z.infer<typeof LeadSignalSchema>;

// ---------------------------------------------------------------------------
// Output completo do extractor por turno.
// Limites cognitivos justificados:
//   max 3 fatos: Miller (1956) 7±2; acima de 3 por turno indica critério frouxo
//   max 2 sinais: sinal de engajamento é meta-informação, não fato — 2 é suficiente
// ---------------------------------------------------------------------------
export const ExtractLeadFactsOutputSchema = z.object({
  fatos: z
    .array(LeadFactSchema)
    .max(7)
    .default([])
    .describe(
      "0 a 7 fatos memoráveis extraídos deste turno (Mem0 5±2 — teto generoso). " +
      "Se o turno não continha nada memorável, retornar array vazio.",
    ),
  sinais_engajamento: z
    .array(LeadSignalSchema)
    .max(2)
    .default([])
    .describe(
      "0 a 2 sinais de engajamento observados neste turno. " +
      "Sinais alimentam o belief e o cálculo de delay — NÃO vão para lead_memory diretamente.",
    ),
  extrair_nada: z
    .boolean()
    .default(true)
    .describe(
      "true SOMENTE se o turno inteiro era ruído (cumprimento, filler, resposta monossilábica). " +
      "false se há ao menos 1 fato ou 1 sinal, mesmo que array fatos seja vazio mas sinais não. " +
      "Default true (conservador) quando LLM retorna output parcial sem este campo.",
    ),
  justificativa_noop: z
    .string()
    .max(100)
    .nullable()
    .default(null)
    .describe(
      "Preenchido SOMENTE quando extrair_nada=true. " +
      "Ex.: 'turno era cumprimento inicial — sem conteúdo factual'. null nos demais casos.",
    ),
});

export type ExtractLeadFactsOutput = z.infer<typeof ExtractLeadFactsOutputSchema>;

// ---------------------------------------------------------------------------
// Input do handler da edge function
// ---------------------------------------------------------------------------
export type ExtractLeadFactsInput = {
  conversationId: string;
  leadId: string;
  tenantId: string;
  turnoLeadContent: string;
  turnoAgenteContent: string;
  beliefAtual: string | null;
  memoriaAgregada: string;
  /** Número do turno atual (ciclo) — para log de proveniência */
  turnoCiclo?: number;
};

// ---------------------------------------------------------------------------
// Thresholds anti-duplicação por categoria (Mem0-style)
// Fonte: wave0-cognitivo §4
// ---------------------------------------------------------------------------
export const THRESHOLD_POR_CATEGORIA: Record<CategoriaLeadMemory, number> = {
  fato_biografico: 0.85,
  fato_financeiro: 0.90,
  objecao: 0.90,
  interesse: 0.80,
  historico_negociacao: 0.80,
};

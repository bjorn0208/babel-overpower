/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { z } from "npm:zod@3";

// ---------------------------------------------------------------------------
// Tags vivas — extraídas turno a turno pelo agente.
// Diferente de leads.tags (massa pré-existente) — aqui é tag_observations,
// alimentada por LLM com base no conteúdo SEMÂNTICO da conversa.
// Vai pra cron-clusterizar-tags-observadas que gera tag_merge_suggestions.
// ---------------------------------------------------------------------------

export const TagObservationSchema = z.object({
  tag_text: z
    .string()
    .min(3)
    .max(60)
    .describe(
      "Tag semântica curta em snake_case pt-BR. " +
      "Ex.: 'objecao_preco_alto', 'pediu_garantia', 'comparou_concorrente', 'mencionou_familia'.",
    ),
  contexto_excerto: z
    .string()
    .min(5)
    .max(200)
    .nullable()
    .describe(
      "Trecho curto da fala do lead que justifica a tag. Ex.: 'tá caro pra mim'. " +
      "null quando inferido sem citação direta.",
    ),
});

export type TagObservation = z.infer<typeof TagObservationSchema>;

export const ExtractTagObservationsOutputSchema = z.object({
  tags: z
    .array(TagObservationSchema)
    .max(5)
    .default([])
    .describe(
      "0 a 5 tags semânticas observadas neste turno. " +
      "Se turno é cumprimento/filler, retorna array vazio.",
    ),
  extrair_nada: z
    .boolean()
    .default(true)
    .describe(
      "true quando turno é ruído (cumprimento, filler, monossilábico). " +
      "false quando há ao menos 1 tag legítima.",
    ),
  justificativa_noop: z
    .string()
    .max(100)
    .nullable()
    .default(null)
    .describe(
      "Preenchido SOMENTE quando extrair_nada=true. " +
      "Ex.: 'turno era confirmação simples'. null nos demais casos.",
    ),
});

export type ExtractTagObservationsOutput = z.infer<typeof ExtractTagObservationsOutputSchema>;

export type ExtractTagObservationsInput = {
  conversationId: string;
  leadId: string | null;
  tenantId: string;
  turnoLeadContent: string;
  turnoAgenteContent: string;
  turnoCiclo?: number;
};

-- FASE 11.5.c.1: backfill retroativo de knowledge_chunks.tipo aplicando
-- mapeamento de tags (mesmo de derivarTipo() em sync-chunks/index.ts).
-- Sem isto, retrieval por tipo no motor v2 retorna vazio pra valor/resposta/pagamento.

UPDATE public.knowledge_chunks SET tipo =
  CASE
    WHEN 'preco' = ANY(tags) THEN 'valor'
    WHEN 'valor' = ANY(tags) THEN 'valor'
    WHEN 'pagamento' = ANY(tags) THEN 'pagamento'
    WHEN 'faq' = ANY(tags) THEN 'resposta'
    WHEN 'objecao' = ANY(tags) THEN 'resposta'
    WHEN 'resposta' = ANY(tags) THEN 'resposta'
    WHEN 'processo' = ANY(tags) THEN 'processo'
    WHEN 'fluxo' = ANY(tags) THEN 'processo'
    WHEN 'atendimento' = ANY(tags) THEN 'processo'
    WHEN 'garantia' = ANY(tags) THEN 'processo'
    WHEN 'qualificador' = ANY(tags) THEN 'processo'
    ELSE 'apresentacao'
  END
WHERE tipo IN ('apresentacao', 'processo');
;

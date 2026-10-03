
-- Migration: r01_4_lead_memory_confianca_column
-- Adiciona coluna confianca (0..1) em lead_memory.
-- O extract-lead-facts grava a confiança do extrator nesta coluna.
-- Rows legadas e fontes manuais recebem default 0.8.
-- DOWN: ALTER TABLE public.lead_memory DROP COLUMN IF EXISTS confianca;

ALTER TABLE public.lead_memory
  ADD COLUMN IF NOT EXISTS confianca numeric(3,2) NOT NULL DEFAULT 0.8
  CHECK (confianca >= 0 AND confianca <= 1);

COMMENT ON COLUMN public.lead_memory.confianca IS
  'Confiança do extrator (0..1) na classificação do fato. Gravado pelo extract-lead-facts. Default 0.8 para rows legadas ou fontes manuais.';

;

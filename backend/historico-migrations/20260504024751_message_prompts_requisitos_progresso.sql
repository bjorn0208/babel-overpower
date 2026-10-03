-- Onda 1 / Projeto: Fase x Requisitos Semanticos
-- Migration: message_prompts_requisitos_progresso
-- Adiciona coluna requisitos_progresso em message_prompts.
-- Snapshot por turno do estado de requisitos — auditoria e UI de progresso.

ALTER TABLE public.message_prompts
  ADD COLUMN IF NOT EXISTS requisitos_progresso jsonb;

COMMENT ON COLUMN public.message_prompts.requisitos_progresso IS
'Snapshot por turno: { fase, todos_obrigatorios_cumpridos, cumpridos: [...], pendentes_obrigatorios: [...], pendentes_opcionais: [...] }. Permite auditoria de cura e UI de progresso.';
;

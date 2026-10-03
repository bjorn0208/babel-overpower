ALTER TABLE public.message_prompts
  ADD COLUMN IF NOT EXISTS tokens JSONB,
  ADD COLUMN IF NOT EXISTS trigger_rejeitado JSONB;

COMMENT ON COLUMN public.message_prompts.tokens IS 'prompt_tokens + completion_tokens + total do turno';
COMMENT ON COLUMN public.message_prompts.trigger_rejeitado IS 'Trigger que quase disparou mas foi filtrado (acao, score, threshold)';
;

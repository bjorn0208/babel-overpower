-- Adiciona velocidade_atual_s em lead_engagement.
-- Feature prevista nos docs do agente vivo · faltava criar no schema.
-- Sinal de "quão rápido o lead respondeu agora" (último turno) vs velocidade_media_s (histórico).

ALTER TABLE public.lead_engagement
  ADD COLUMN IF NOT EXISTS velocidade_atual_s integer;

COMMENT ON COLUMN public.lead_engagement.velocidade_atual_s IS
  'Velocidade em segundos da última resposta do lead (turno mais recente). Atualizado pelo aggregator a cada turno.';
;

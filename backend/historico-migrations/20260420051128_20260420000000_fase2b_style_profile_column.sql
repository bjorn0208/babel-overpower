
-- Fase 2B — Decisão 10: coluna style_profile em campaign_leads
-- Perfil de estilo do lead para espelhamento sutil (default leve, sem dropdown — Decisão 9)

ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS style_profile jsonb DEFAULT NULL;

COMMENT ON COLUMN public.campaign_leads.style_profile IS
  'Perfil de estilo do lead para espelhamento sutil (Decisão 10, 2026-04-20). '
  'Schema: {registro: formal|informal|neutro, tamanho_medio_msg: int, usa_emoji: bool, '
  'emojis_frequentes: text[], usa_audio: bool, pct_audio_vs_texto: float}. '
  'NULL = ainda não calculado, chat trata como sem espelhamento.';

;

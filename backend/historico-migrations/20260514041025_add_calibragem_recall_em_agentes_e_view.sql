-- HOTFIX 2026-05-14 01:08 BRT — `calibragem_recall` faltante derruba motor.
-- agentes_usuario é VIEW de agentes. Adiciona coluna na tabela base + recria view.
ALTER TABLE public.agentes
  ADD COLUMN IF NOT EXISTS calibragem_recall jsonb;

COMMENT ON COLUMN public.agentes.calibragem_recall IS
  'Calibragem do agente lida pelo motor: empatia (profundidade/acolhimento/validação/pausa_em_emocao/escalar_crise) + futuros sliders. Nullable.';

CREATE OR REPLACE VIEW public.agentes_usuario AS
SELECT
  id, user_id, nome_agente, created_at, updated_at,
  identidade, fluxo, configuracao,
  modelo_principal, temperatura, max_tokens,
  product_flows, is_active, tom_agente,
  calibragem_recall
FROM public.agentes;
;

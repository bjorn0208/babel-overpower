-- 2026-05-08 17:48 BRT
-- Adiciona public.mensagens.entregue_at: timestamp em que a bolha foi confirmada
-- entregue (Z-API ok pra WhatsApp, ou ack interno pra simulated_webchat).
-- Frontend usa esse campo pra esconder bolhas que ainda nao sairam pro lead,
-- sincronizando UI com a saida real (Theus 2026-05-08).

ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS entregue_at timestamptz;

COMMENT ON COLUMN public.mensagens.entregue_at IS
'Timestamp em que a bolha foi confirmada entregue (Z-API ok ou ack interno). NULL=aguardando worker dispatchar. Frontend filtra role=assistant + entregue_at IS NULL para esconder bolhas pendentes.';

-- Backfill: marca historico inteiro como entregue (created_at) pra UI nao
-- esconder mensagens antigas. Mensagens novas com entregue_at NULL sao as
-- que esperam o worker.
UPDATE public.mensagens SET entregue_at = created_at WHERE entregue_at IS NULL;

-- Indice parcial pra worker buscar bolhas pendentes (queries diagnostico).
CREATE INDEX IF NOT EXISTS idx_mensagens_entregue_at_pendentes
  ON public.mensagens (conversation_id, created_at)
  WHERE entregue_at IS NULL AND role = 'assistant' AND deleted_at IS NULL;
;

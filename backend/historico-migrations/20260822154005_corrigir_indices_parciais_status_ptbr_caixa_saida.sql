-- Corrige índices parciais da caixa_saida_mensagens: predicados apontavam pros
-- status em inglês pré-rename ('pending'/'sent'/'failed') e nunca casavam com
-- os dados reais ('pendente'/'enviada'/'falhou') — varredura caía em seq scan
-- de 103 mil linhas (4,3 s) a cada tick do consumidor da caixa de saída.
-- Down: recriar os índices antigos com os predicados 'pending'/'sent'/'failed'.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DROP INDEX IF EXISTS public.idx_message_outbox_pending_scheduled;
DROP INDEX IF EXISTS public.idx_message_outbox_sent_failed_dispatched;

CREATE INDEX IF NOT EXISTS idx_caixa_saida_pendente_agendada
  ON public.caixa_saida_mensagens (status, scheduled_at)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_caixa_saida_enviada_falhou_despachada
  ON public.caixa_saida_mensagens (status, dispatched_at DESC)
  WHERE status IN ('enviada', 'falhou');
;

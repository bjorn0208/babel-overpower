-- Busca server-side do app Conversas (buscarConversasPorTermo) faz
-- ilike %termo% em nome_exibicao/name/phone. Sem trigram = seq scan por tecla
-- digitada; com 200-300 tenants vira gargalo. pg_trgm já habilitada.

SET lock_timeout = '4s';
SET statement_timeout = '60s';

CREATE INDEX IF NOT EXISTS idx_leads_nome_exibicao_trgm
  ON public.leads USING gin (nome_exibicao extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_name_trgm
  ON public.leads USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm
  ON public.leads USING gin (phone extensions.gin_trgm_ops);
;

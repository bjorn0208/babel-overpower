-- Fase 1 canal Instagram: credenciais por tenant na tabela canais (linha type='instagram')
set lock_timeout = '2s';
set statement_timeout = '10s';

ALTER TABLE public.canais ADD COLUMN IF NOT EXISTS ig_account_id text;
ALTER TABLE public.canais ADD COLUMN IF NOT EXISTS ig_token text;
ALTER TABLE public.canais ADD COLUMN IF NOT EXISTS ig_username text;

-- Lookup do webhook-instagram: resolve canal pelo id da conta IG (parcial — maioria das linhas é whatsapp)
-- Index normal (não CONCURRENTLY): tabela tem ~dezenas de linhas, lock de milissegundos
CREATE INDEX IF NOT EXISTS canais_ig_account_id_idx
  ON public.canais (ig_account_id)
  WHERE ig_account_id IS NOT NULL;
;

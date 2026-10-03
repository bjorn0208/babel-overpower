ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS campaign_settings jsonb NOT NULL DEFAULT '{"inatividade_valor": 1, "inatividade_unidade": "dia"}'::jsonb;
;

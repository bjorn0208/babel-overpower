ALTER TABLE public.platform_settings 
  ADD COLUMN IF NOT EXISTS usd_brl_cotacao numeric NOT NULL DEFAULT 5.30,
  ADD COLUMN IF NOT EXISTS usd_brl_atualizado_em timestamptz;

UPDATE public.platform_settings 
SET usd_brl_atualizado_em = now()
WHERE usd_brl_atualizado_em IS NULL;

COMMENT ON COLUMN public.platform_settings.usd_brl_cotacao IS 'Cotação USD→BRL pra exibir custos em R$ no PainelCustos. Atualizada via botão na UI (awesomeapi.com.br).';
COMMENT ON COLUMN public.platform_settings.usd_brl_atualizado_em IS 'Quando a cotação foi atualizada pela última vez (UTC).';
;

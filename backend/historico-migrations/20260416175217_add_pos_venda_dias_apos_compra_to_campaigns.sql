ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS pos_venda_dias_apos_compra integer NULL
  CHECK (pos_venda_dias_apos_compra IS NULL OR pos_venda_dias_apos_compra >= 0);

COMMENT ON COLUMN public.campaigns.pos_venda_dias_apos_compra IS
  'Dias de espera após a compra antes de abordar o lead. Usado em campanhas type=pos_venda. NULL = sem delay.';
;

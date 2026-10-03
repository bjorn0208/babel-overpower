-- Preço que o tenant cobra do cliente final na venda pelo agente/link
ALTER TABLE public.consultas_config_tenant
  ADD COLUMN IF NOT EXISTS preco_venda_padrao numeric(10,2) CHECK (preco_venda_padrao IS NULL OR preco_venda_padrao >= 0);
COMMENT ON COLUMN public.consultas_config_tenant.preco_venda_padrao IS 'Preço padrão cobrado do cliente final quando o agente vende a consulta (tenant define).';
;

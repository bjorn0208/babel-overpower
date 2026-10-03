-- App Consulta: preço de venda por tipo de documento (CPF/CNPJ).
-- O agente FALA o preço via RAG; estes campos são o número que o LINK COBRA.
-- Migra o preco_venda_padrao atual (mantido 1 ciclo como fallback).

ALTER TABLE public.consultas_config_tenant
  ADD COLUMN IF NOT EXISTS preco_venda_cpf numeric(10,2),
  ADD COLUMN IF NOT EXISTS preco_venda_cnpj numeric(10,2);

COMMENT ON COLUMN public.consultas_config_tenant.preco_venda_cpf IS
  'Preço (R$) cobrado do cliente final na venda de consulta CPF via link. O agente fala o preço pelo RAG; este número é só pra cobrança/checkout.';
COMMENT ON COLUMN public.consultas_config_tenant.preco_venda_cnpj IS
  'Preço (R$) cobrado do cliente final na venda de consulta CNPJ via link. O agente fala o preço pelo RAG; este número é só pra cobrança/checkout.';

-- Migração: parte do preço único atual pros dois tipos (não perde config dos tenants já configurados).
UPDATE public.consultas_config_tenant
SET preco_venda_cpf = COALESCE(preco_venda_cpf, preco_venda_padrao),
    preco_venda_cnpj = COALESCE(preco_venda_cnpj, preco_venda_padrao)
WHERE preco_venda_padrao IS NOT NULL;
;

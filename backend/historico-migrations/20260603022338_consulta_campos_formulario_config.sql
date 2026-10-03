-- Campos configuráveis do formulário do link público de consulta.
-- Lista de objetos {slug, rotulo, tipo, obrigatorio, ativo}. O documento (CPF/CNPJ)
-- NÃO entra aqui (é sempre pedido e destacado no link — é o objeto da consulta).
ALTER TABLE public.consultas_config_tenant
  ADD COLUMN IF NOT EXISTS campos_formulario jsonb NOT NULL DEFAULT
  '[{"slug":"nome_completo","rotulo":"Nome completo","tipo":"text","obrigatorio":true,"ativo":true},{"slug":"telefone","rotulo":"Telefone (com DDD)","tipo":"tel","obrigatorio":true,"ativo":true}]'::jsonb;

COMMENT ON COLUMN public.consultas_config_tenant.campos_formulario IS
  'Campos do formulário do link público (além do documento, que é sempre pedido). Array de {slug, rotulo, tipo: text|tel|email|numero, obrigatorio, ativo}.';
;

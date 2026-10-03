-- Default de campos_formulario = nome + telefone (o que a aba já mostra) PERSISTIDO no banco.
-- Antes a coluna nascia '[]' e a aba exibia um default só visual → link não mostrava nada.

ALTER TABLE public.consultas_config_tenant
  ALTER COLUMN campos_formulario SET DEFAULT
  '[{"slug":"nome_completo","rotulo":"Nome completo","tipo":"text","obrigatorio":true,"ativo":true},{"slug":"telefone","rotulo":"Telefone (com DDD)","tipo":"tel","obrigatorio":true,"ativo":true}]'::jsonb;

-- Backfill: configs com array vazio recebem o default (alinha aba ↔ link pros tenants atuais).
UPDATE public.consultas_config_tenant
SET campos_formulario =
  '[{"slug":"nome_completo","rotulo":"Nome completo","tipo":"text","obrigatorio":true,"ativo":true},{"slug":"telefone","rotulo":"Telefone (com DDD)","tipo":"tel","obrigatorio":true,"ativo":true}]'::jsonb
WHERE jsonb_array_length(coalesce(campos_formulario, '[]'::jsonb)) = 0;
;

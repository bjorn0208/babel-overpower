-- Fix advisor security_definer_view: views devem usar security_invoker pra herdar RLS do user que consulta

ALTER VIEW public.contratos_legacy_en               SET (security_invoker = on);
ALTER VIEW public.contratos_template_legacy_en      SET (security_invoker = on);
ALTER VIEW public.documentos_cliente_legacy_en      SET (security_invoker = on);
ALTER VIEW public.pagamentos_cliente_legacy_en      SET (security_invoker = on);
ALTER VIEW public.log_acesso_contrato_legacy_en     SET (security_invoker = on);
ALTER VIEW public.config_contrato_legacy_en         SET (security_invoker = on);

;

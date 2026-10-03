CREATE OR REPLACE FUNCTION public.garantir_categorias_padrao(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid := COALESCE((SELECT auth.uid()), p_tenant_id);
  v_qtd int := 0;
BEGIN
  -- Tranca de identidade (2026-09-08): não pode viver só no GRANT.
  PERFORM public.tenant_efetivo(p_tenant_id);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant obrigatório';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categorias_financeiras WHERE tenant_id = v_tenant AND deleted_at IS NULL) THEN
    INSERT INTO public.categorias_financeiras (tenant_id, nome)
    VALUES (v_tenant, 'Casa'), (v_tenant, 'Empresa'), (v_tenant, 'Transporte'),
           (v_tenant, 'Alimentação'), (v_tenant, 'Contas'), (v_tenant, 'Investimento');
    GET DIAGNOSTICS v_qtd = ROW_COUNT;
  END IF;
  RETURN v_qtd;
END;
$function$


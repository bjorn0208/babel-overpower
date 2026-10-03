CREATE OR REPLACE FUNCTION public.marcar_conversa_lida(p_conv_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_caller uuid := (select auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.conversas WHERE id = p_conv_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  IF v_tenant != v_caller
     AND NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = v_caller AND parent_user_id = v_tenant
     )
  THEN
    RAISE EXCEPTION 'sem permissao pra marcar conversa lida';
  END IF;

  UPDATE public.conversas
  SET visto_em = now()
  WHERE id = p_conv_id;
END;
$function$


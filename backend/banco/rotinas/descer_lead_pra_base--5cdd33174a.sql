CREATE OR REPLACE FUNCTION public.descer_lead_pra_base(p_lead_id uuid, p_motivo text DEFAULT 'manual'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_id uuid;
  v_tenant_id uuid;
BEGIN
  v_caller_id := (SELECT auth.uid());

  SELECT l.tenant_id INTO v_tenant_id
  FROM public.leads l
  WHERE l.id = p_lead_id
    AND l.deleted_at IS NULL
    AND (
      l.tenant_id = v_caller_id
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_caller_id AND p.parent_user_id = l.tenant_id
      )
    );

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'lead não encontrado ou acesso negado';
  END IF;

  UPDATE public.leads
  SET location = 'base', updated_at = now()
  WHERE id = p_lead_id
    AND location != 'base'
    AND deleted_at IS NULL;

  RETURN FOUND;
END;
$function$


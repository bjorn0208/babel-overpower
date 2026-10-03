CREATE OR REPLACE FUNCTION public.importar_contatos_para_base(p_tenant_id uuid, p_contatos jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_admin boolean := public.is_platform_admin();
  v_team boolean;
  v_count integer := 0;
  v_item jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND parent_user_id = p_tenant_id
  ) INTO v_team;
  IF NOT (p_tenant_id = v_caller OR v_admin OR v_team) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_contatos)
  LOOP
    INSERT INTO public.leads (tenant_id, name, nome_exibicao, phone, email, tags, location)
    VALUES (
      p_tenant_id,
      COALESCE(v_item->>'name', v_item->>'phone'),
      v_item->>'name',
      v_item->>'phone',
      v_item->>'email',
      CASE
        WHEN jsonb_typeof(v_item->'tags') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'tags'))
        ELSE NULL
      END,
      'base'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$


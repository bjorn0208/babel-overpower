CREATE OR REPLACE FUNCTION public.excluir_pergunta_mentor(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_uid    uuid := (SELECT auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant
    FROM public.perguntas_sem_resposta
    WHERE id = p_id;

  IF v_tenant IS NULL OR v_tenant <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissão');
  END IF;

  DELETE FROM public.perguntas_sem_resposta WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$


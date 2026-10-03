CREATE OR REPLACE FUNCTION public.responder_pergunta_mentor(p_id uuid, p_resposta text, p_aprovar_direto boolean DEFAULT false)
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
    FROM public.perguntas_sem_resposta WHERE id = p_id;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'pergunta não encontrada');
  END IF;
  IF v_tenant <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissão');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.perguntas_sem_resposta
    WHERE id = p_id AND status_loop = 'aguardando_dono'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'pergunta não está aguardando resposta');
  END IF;

  UPDATE public.perguntas_sem_resposta
    SET resposta_do_dono = p_resposta,
        respondida_em    = now(),
        respondida_por   = v_uid,
        status_loop      = 'dono_respondeu',
        resolvido        = true,
        resolvido_em     = now(),
        aprovar_direto   = p_aprovar_direto   -- Δ 2026-09-08
    WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'aprovar_direto', p_aprovar_direto);
END;
$function$


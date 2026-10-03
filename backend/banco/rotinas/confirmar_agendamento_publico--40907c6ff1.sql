CREATE OR REPLACE FUNCTION public.confirmar_agendamento_publico(p_token uuid, p_inicio timestamp with time zone, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reg public.agendamentos_link%ROWTYPE;
  v_res jsonb;
  v_nome text;
  v_motivo text;
  v_titulo text;
BEGIN
  IF p_token IS NULL OR p_inicio IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'token_e_inicio_obrigatorios');
  END IF;
  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'confirmar_agendamento_publico', 10);

  SELECT * INTO v_reg FROM public.agendamentos_link WHERE chave_publica = p_token FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  END IF;
  IF v_reg.status = 'agendado' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_agendado');
  END IF;

  v_nome   := COALESCE(NULLIF(btrim(p_dados->>'nome'), ''), 'Contato');
  v_motivo := NULLIF(btrim(p_dados->>'motivo'), '');
  v_titulo := 'Reunião — ' || v_nome;
  IF v_motivo IS NOT NULL THEN
    v_titulo := v_titulo || ': ' || v_motivo;
  END IF;

  v_res := public.agendar_reuniao_lead(
    v_reg.tenant_id, v_reg.conversa_id, v_reg.lead_id, v_reg.agente_id,
    p_inicio, v_titulo
  );
  IF (v_res->>'ok')::boolean IS DISTINCT FROM true THEN
    RETURN v_res;
  END IF;

  UPDATE public.agendamentos_link
     SET status = 'agendado',
         dados_cliente = COALESCE(p_dados, '{}'::jsonb),
         scheduled_at = p_inicio,
         sala_reuniao_id = (v_res->>'sala_id')::uuid,
         compromisso_id = (v_res->>'compromisso_id')::uuid,
         updated_at = now()
   WHERE id = v_reg.id;

  RETURN jsonb_build_object(
    'ok', true,
    'scheduled_at', p_inicio,
    'link_sala', '/sala/' || (v_res->>'chave_publica')
  );
END;
$function$


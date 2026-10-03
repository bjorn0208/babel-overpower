CREATE OR REPLACE FUNCTION public.monitor_saude_motor()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_alertas jsonb := '[]'::jsonb;
  v_motor_parado jsonb;
  v_leads_sem_resposta jsonb;
  v_retries_falhando jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '10s', true);

  WITH ultimas AS (
    SELECT 
      c.id AS conversation_id,
      c.tenant_id,
      c.agente_id,
      c.status,
      c.agent_enabled,
      MAX(m.created_at) FILTER (WHERE m.role = 'user') AS ultima_user,
      MAX(m.created_at) FILTER (WHERE m.role IN ('assistant','human')) AS ultima_agente,
      COUNT(*) FILTER (WHERE m.role = 'user' AND m.created_at > now() - interval '48 hours') AS msgs_lead_48h,
      COUNT(*) FILTER (WHERE m.role IN ('assistant','human') AND m.created_at > now() - interval '48 hours') AS msgs_agente_48h
    FROM mensagens m
    JOIN conversas c ON c.id = m.conversation_id
    WHERE c.status IN ('ativa', 'humano')
      AND c.agent_enabled IS NOT FALSE
      AND m.deleted_at IS NULL
      AND m.created_at > now() - interval '48 hours'
    GROUP BY c.id, c.tenant_id, c.agente_id, c.status, c.agent_enabled
  ),
  motor_parado AS (
    SELECT 
      conversation_id,
      tenant_id,
      agente_id,
      ultima_user,
      ultima_agente,
      EXTRACT(EPOCH FROM (now() - ultima_user))/60 AS min_sem_resposta
    FROM ultimas
    WHERE ultima_user > COALESCE(ultima_agente, '1970-01-01'::timestamptz)
      AND ultima_user < now() - interval '30 minutes'
      AND msgs_lead_48h > 0
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.min_sem_resposta DESC), '[]'::jsonb)
  INTO v_motor_parado
  FROM motor_parado m
  WHERE m.min_sem_resposta > 30
  LIMIT 50;

  IF jsonb_array_length(v_motor_parado) > 0 THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'motor_parado',
      'severity', 'vermelho',
      'count', jsonb_array_length(v_motor_parado),
      'detalhes', v_motor_parado
    );
  END IF;

  WITH sem_resposta AS (
    SELECT 
      c.tenant_id,
      COUNT(DISTINCT c.id) AS conversas_afetadas,
      COUNT(*) FILTER (WHERE c.agent_enabled IS NOT FALSE) AS com_agente_ligado
    FROM conversas c
    WHERE c.status IN ('ativa', 'humano')
      AND c.agent_enabled IS NOT FALSE
      AND EXISTS (
        SELECT 1 FROM mensagens m
        WHERE m.conversation_id = c.id
          AND m.role = 'user'
          AND m.deleted_at IS NULL
          AND m.created_at > now() - interval '30 minutes'
      )
      AND NOT EXISTS (
        SELECT 1 FROM mensagens m
        WHERE m.conversation_id = c.id
          AND m.role IN ('assistant','human')
          AND m.deleted_at IS NULL
          AND m.created_at > now() - interval '30 minutes'
      )
    GROUP BY c.tenant_id
    HAVING COUNT(DISTINCT c.id) >= 3
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.conversas_afetadas DESC), '[]'::jsonb)
  INTO v_leads_sem_resposta
  FROM sem_resposta s;

  IF jsonb_array_length(v_leads_sem_resposta) > 0 THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'leads_sem_resposta_30min',
      'severity', 'laranja',
      'tenants_afetados', jsonb_array_length(v_leads_sem_resposta),
      'detalhes', v_leads_sem_resposta
    );
  END IF;

  WITH retries AS (
    SELECT 
      tenant_id,
      COUNT(*) AS falhas,
      MAX(retries) AS max_retries,
      MAX(created_at) AS ultima_tentativa
    FROM caixa_saida_mensagens
    WHERE status IN ('pendente', 'erro', 'agendada')
      AND retries >= 3
      AND created_at > now() - interval '1 hour'
    GROUP BY tenant_id
    HAVING COUNT(*) >= 5
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.falhas DESC), '[]'::jsonb)
  INTO v_retries_falhando
  FROM retries r;

  IF jsonb_array_length(v_retries_falhando) > 0 THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'retentativas_falhando',
      'severity', 'vermelho',
      'tenants_afetados', jsonb_array_length(v_retries_falhando),
      'detalhes', v_retries_falhando
    );
  END IF;

  INSERT INTO public.agendamentos_log (cronjob_nome, iniciou_em, terminou_em, duracao_ms, resultado, payload_resposta)
  VALUES ('monitor_saude_motor', now(), now(), 0, 
    CASE WHEN jsonb_array_length(v_alertas) > 0 THEN 'erro' ELSE 'sucesso' END,
    v_alertas);

  RETURN v_alertas;
END;
$function$


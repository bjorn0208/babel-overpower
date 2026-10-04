-- B-05: Correção de funções SQL com referências quebradas
-- Ref: AUDITORIA-BACK.md §B-05

-- 1. obter_documentos_publicos_cliente: usa file_name/label/file_path/file_type
--    mas documentos_cliente tem nome_arquivo/rotulo/caminho_arquivo/tipo_arquivo
CREATE OR REPLACE FUNCTION public.obter_documentos_publicos_cliente(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_lead_id uuid; v_result json;
BEGIN
  SELECT id INTO v_lead_id FROM public.leads WHERE chave_rastreamento = p_token LIMIT 1;
  IF v_lead_id IS NULL THEN RETURN '[]'::json; END IF;
  SELECT COALESCE(json_agg(json_build_object(
    'id', d.id,
    'file_name', d.nome_arquivo,
    'label', d.rotulo,
    'file_path', d.caminho_arquivo,
    'file_type', d.tipo_arquivo,
    'created_at', d.created_at
  ) ORDER BY d.created_at DESC), '[]'::json) INTO v_result
  FROM public.documentos_cliente d WHERE d.lead_id = v_lead_id;
  RETURN v_result;
END;
$function$;

-- 2. monitor_saude_motor: usa mensagens/conversas sem schema (search_path='')
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
    FROM public.mensagens m
    JOIN public.conversas c ON c.id = m.conversation_id
    WHERE c.status IN ('ativa', 'humano')
      AND c.agent_enabled IS NOT FALSE
      AND m.deleted_at IS NULL
      AND m.created_at > now() - interval '48 hours'
    GROUP BY c.id, c.tenant_id, c.agente_id, c.status, c.agent_enabled
  ),
  motor_parado AS (
    SELECT
      conversation_id, tenant_id, agente_id, ultima_user, ultima_agente,
      msgs_lead_48h, msgs_agente_48h
    FROM ultimas
    WHERE msgs_lead_48h > 0 AND msgs_agente_48h = 0
  )
  SELECT jsonb_agg(jsonb_build_object(
    'conversation_id', conversation_id,
    'tenant_id', tenant_id,
    'agente_id', agente_id,
    'ultima_user', ultima_user,
    'msgs_lead_48h', msgs_lead_48h
  )) INTO v_motor_parado FROM motor_parado;

  RETURN jsonb_build_object(
    'alertas', COALESCE(v_alertas, '[]'::jsonb),
    'motor_parado', COALESCE(v_motor_parado, '[]'::jsonb),
    'gerado_em', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM, 'gerado_em', now());
END;
$function$;

-- 3. metricas_base: coluna product não existe em leads — adicionada na migration anterior
--    Se ainda não existir, a função falhará; o ALTER TABLE da migration 20261004_b05_tabelas_ausentes
--    já cobre isso. Nenhuma alteração no corpo da função necessária.

-- 4. get_indicador_publico: usa token mas tabela tem chave_publica
--    A migration anterior adicionou coluna token; função permanece válida.

-- 5. aprovar_trecho_conversa_para_rag: usa criado_em/atualizado_em/created_by/ativa
--    A migration anterior adicionou essas colunas; função permanece válida.

-- 6. obter_prompts_conversa: usa chunks_usados
--    A migration anterior adicionou essa coluna; função permanece válida.
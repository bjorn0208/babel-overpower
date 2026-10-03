-- Fix: remove referencias a tabelas dropadas (atribuicoes_canario, entregas_pendentes,
-- exclusoes_tenant, repropostas_lead_campanha, travas_lead) e corrige nome de coluna em
-- contratos (conversa_id, nao conversation_id). Funcao reflete o schema atual.
CREATE OR REPLACE FUNCTION public.excluir_conversas_profundo_para_atendimento(p_conversa_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_n_conv integer;
  v_n_leads integer := 0;
  v_uid uuid := (SELECT auth.uid());
  v_ids uuid[];
  v_lead_candidates uuid[];
  v_orphan uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth obrigatório';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
    INTO v_ids
  FROM unnest(coalesce(p_conversa_ids, ARRAY[]::uuid[])) AS x;

  IF cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('deleted_conversa_count', 0, 'deleted_lead_count', 0);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversas c
    WHERE c.id = ANY (v_ids)
      AND NOT (
        c.tenant_id = v_uid
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = v_uid AND p.parent_user_id = c.tenant_id
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles padm
          WHERE padm.id = v_uid AND padm.system_role = 'platform_admin'
        )
      )
  ) THEN
    RAISE EXCEPTION 'sem permissão para uma ou mais conversas';
  END IF;

  SELECT cardinality(v_ids) INTO v_n_conv;

  -- ATENCAO: DELETE direto em storage.objects bloqueado pelo Supabase desde 2026-05.
  -- Anexos das conversas excluidas ficam orfaos no bucket anexos-chat.

  SELECT coalesce(array_agg(DISTINCT c.lead_id) FILTER (WHERE c.lead_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_lead_candidates
  FROM public.conversas AS c
  WHERE c.id = ANY (v_ids);

  -- FASE 1: pagamentos antes de contratos da conversa (contratos.conversa_id, nao conversation_id)
  DELETE FROM public.pagamentos_cliente pc
  WHERE pc.contract_id IN (SELECT id FROM public.contratos WHERE conversa_id = ANY (v_ids));

  -- FASE 2: dependências diretas das conversas
  DELETE FROM public.compromissos WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.travas_conversa WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.tickets_conversa WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.pausa_conversa WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.prompts_mensagem WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.calibracao_padrao
  WHERE conversation_id = ANY (v_ids)
     OR message_id IN (SELECT id FROM public.mensagens WHERE conversation_id = ANY (v_ids));
  DELETE FROM public.mensagens WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.acoes_agendadas WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.auditoria_conversa WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.caixa_saida_mensagens WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.candidatos_bloco WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.contratos WHERE conversa_id = ANY (v_ids);
  DELETE FROM public.crenca_conversa WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.dicas_dono WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.engajamento_turnos WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.estado_digitacao WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.fichas_lead WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.incidentes_seguranca WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.invocacoes_ferramenta WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.manipulacao_log WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.memoria_episodica WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.memoria_lead WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.observacoes_tag WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.perguntas_sem_resposta WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.registro_reflexao WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.registro_uso_api WHERE conversation_id = ANY (v_ids);
  DELETE FROM public.sessoes_chat_publico WHERE conversation_id = ANY (v_ids);

  DELETE FROM public.conversas WHERE id = ANY (v_ids);

  -- FASE 3: leads que não ficaram com conversa
  SELECT coalesce(array_agg(lc), ARRAY[]::uuid[])
    INTO v_orphan
  FROM unnest(v_lead_candidates) AS lc
  WHERE NOT EXISTS (SELECT 1 FROM public.conversas cx WHERE cx.lead_id = lc);

  IF cardinality(v_orphan) > 0 THEN
    v_n_leads := cardinality(v_orphan);

    DELETE FROM public.pagamentos_cliente pc
    WHERE pc.lead_id = ANY (v_orphan)
       OR pc.contract_id IN (SELECT ct.id FROM public.contratos ct WHERE ct.lead_id = ANY (v_orphan));
    DELETE FROM public.candidatos_bloco WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.cofre_pii_lead WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.comissoes_indicacao_campanha WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.compromissos WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.contratos WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.dicas_dono WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.documentos_cliente WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.engajamento_lead WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.fichas_lead WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.leads_campanha WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.manipulacao_log WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.memoria_lead WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.memoria_episodica WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.observacoes_tag WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.prova_social_blocos WHERE lead_origem = ANY (v_orphan);
    DELETE FROM public.sotaques_observados WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.valores_ficha WHERE lead_id = ANY (v_orphan);
    DELETE FROM public.sessoes_chat_publico WHERE lead_id = ANY (v_orphan);

    DELETE FROM public.leads WHERE id = ANY (v_orphan);
  END IF;

  RETURN jsonb_build_object('deleted_conversa_count', v_n_conv, 'deleted_lead_count', v_n_leads);
END;
$function$;
;

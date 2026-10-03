
-- Migration 12 v4 — Wrappers EN compat (skip trigger functions)
DO $$
DECLARE
  pair JSONB;
  v_velho TEXT;
  v_novo TEXT;
  v_args TEXT;
  v_args_identity TEXT;
  v_returns TEXT;
  v_args_call TEXT;
  v_count INT := 0;
  v_select_clause TEXT;
  mapeamento JSONB := '[
    ["apply_tag_merge","aplicar_fusao_tag"],
    ["approve_conversation_excerpt_to_rag","aprovar_trecho_conversa_para_rag"],
    ["approve_testimonial_to_rag","aprovar_depoimento_para_rag"],
    ["backfill_tag_candidates","preencher_candidatos_tag"],
    ["belief_resumo_tenant","crenca_resumo_tenant"],
    ["buffer_incoming_message","bufferar_mensagem_entrante"],
    ["bulk_update_campaign_leads","atualizar_em_massa_leads_campanha"],
    ["campaign_metrics","metricas_campanha"],
    ["check_and_increment_storage","verificar_incrementar_armazenamento"],
    ["check_buffer_ready","verificar_buffer_pronto"],
    ["check_rate_limit","verificar_limite_taxa"],
    ["check_webhook_dedup","verificar_dedup_webhook"],
    ["claim_message_buffer","reivindicar_buffer_mensagem"],
    ["cleanup_expired_team_invitations","limpar_convites_equipe_expirados"],
    ["decrement_storage","decrementar_armazenamento"],
    ["desativar_conversation_pause","desativar_pausa_conversa"],
    ["get_campaign_metrics","obter_metricas_campanha"],
    ["get_contract_by_token","obter_contrato_por_token"],
    ["get_conversation_prompts","obter_prompts_conversa"],
    ["get_lead_ficha_completa","obter_ficha_lead_completa"],
    ["get_public_client_documents","obter_documentos_publicos_cliente"],
    ["get_public_empresa_data","obter_dados_publicos_empresa"],
    ["get_public_service_flow","obter_fluxo_publico_servico"],
    ["get_storage_usage","obter_uso_armazenamento"],
    ["lead_memory_similar","memoria_lead_similar"],
    ["load_agent_context","carregar_contexto_agente"],
    ["log_contract_event","registrar_evento_contrato"],
    ["process_embedding_jobs","processar_tarefas_vetor_semantico"],
    ["public_get_profile","publico_obter_perfil"],
    ["recalculate_storage","recalcular_armazenamento"],
    ["refresh_conversas_usadas_cache","atualizar_cache_conversas_usadas"],
    ["release_conversation_lock","liberar_trava_conversa"],
    ["reset_subscription_cycle","resetar_ciclo_assinatura"],
    ["resolve_referral_code","resolver_codigo_indicacao"],
    ["save_turn_results","salvar_resultados_turno"],
    ["set_buffer_composing","definir_buffer_compondo"],
    ["set_contract_pdf_url_public","definir_contrato_pdf_url_publico"],
    ["set_tag_curadoria_intervalo","definir_tag_curadoria_intervalo"],
    ["sign_contract_public","assinar_contrato_publico"],
    ["submit_payment_proof_public","enviar_comprovante_pagamento_publico"],
    ["supersede_outbox_pendentes","substituir_caixa_saida_pendentes"],
    ["sync_contrato_template_para_rag","sincronizar_template_contrato_para_rag"],
    ["toggle_public_checkpoint","alternar_checkpoint_publico"],
    ["try_conversation_lock","tentar_trava_conversa"]
  ]'::jsonb;
BEGIN
  FOR pair IN SELECT * FROM jsonb_array_elements(mapeamento) LOOP
    v_velho := pair->>0;
    v_novo := pair->>1;
    
    SELECT 
      pg_get_function_arguments(p.oid),
      pg_get_function_identity_arguments(p.oid),
      pg_get_function_result(p.oid),
      (
        SELECT string_agg(arg_name, ', ')
        FROM (
          SELECT 
            p.proargnames[i] AS arg_name,
            COALESCE(p.proargmodes[i], 'i') AS arg_mode
          FROM generate_subscripts(p.proargnames, 1) AS i
        ) sub
        WHERE arg_mode IN ('i','b','v')
      )
    INTO v_args, v_args_identity, v_returns, v_args_call
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_novo
    LIMIT 1;
    
    IF v_args IS NULL THEN CONTINUE; END IF;
    IF v_returns = 'trigger' THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_velho) THEN CONTINUE; END IF;
    
    IF v_returns LIKE 'TABLE%' OR v_returns LIKE 'SETOF%' THEN
      v_select_clause := format('SELECT * FROM public.%I(%s)', v_novo, COALESCE(v_args_call, ''));
    ELSE
      v_select_clause := format('SELECT public.%I(%s)', v_novo, COALESCE(v_args_call, ''));
    END IF;
    
    EXECUTE format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql SECURITY DEFINER SET search_path = '''' AS $f$ %s $f$',
      v_velho,
      COALESCE(v_args, ''),
      v_returns,
      v_select_clause
    );
    
    EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS ''DEPRECATED — use %I''', v_velho, v_args_identity, v_novo);
    
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Total wrappers EN criados: %', v_count;
END $$;

;

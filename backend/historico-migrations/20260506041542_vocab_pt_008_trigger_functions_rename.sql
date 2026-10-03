
-- Migration 8 — Rename de trigger functions sem callers nominais
-- Segurança: triggers chamam função por OID, não por nome → ALTER RENAME preserva

DO $$
DECLARE
  pair JSONB;
  v_velho TEXT;
  v_novo TEXT;
  v_count INT := 0;
  v_args TEXT;
  mapeamento JSONB := '[
    ["audit_conversation_changes","auditar_mudancas_conversa"],
    ["compromissos_set_updated_at","compromissos_definir_atualizado_em"],
    ["handle_new_user","processar_novo_usuario"],
    ["prevent_critical_field_change","prevenir_mudanca_campo_critico"],
    ["public_testimonial_delete_rag","publico_excluir_depoimento_rag"],
    ["public_testimonial_to_rag","publico_depoimento_para_rag"],
    ["seed_campaign_phases","popular_fases_campanha"],
    ["set_lead_memory_atualizado_em","definir_memoria_lead_atualizado_em"],
    ["set_updated_at_conversation_belief","definir_atualizado_em_crenca_conversa"],
    ["set_updated_at_public_profile","definir_atualizado_em_perfil_publico"],
    ["sync_conv_status_from_campaign_lead","sincronizar_status_conversa_de_lead_campanha"],
    ["sync_cronjob_config","sincronizar_config_cronjob"],
    ["sync_cronjob_config_delete","sincronizar_config_cronjob_excluir"],
    ["sync_lead_cards_on_contract_signed","sincronizar_fichas_lead_ao_assinar_contrato"],
    ["sync_lead_tags_from_dados_capturados","sincronizar_tags_lead_de_dados_capturados"],
    ["sync_pipeline_stage_from_lead_card","sincronizar_fase_pipeline_de_ficha_lead"],
    ["touch_conversation_on_message","tocar_conversa_em_mensagem"],
    ["trigger_re_atomizar_empresa","gatilho_re_atomizar_empresa"],
    ["update_lead_cards_updated_at","atualizar_fichas_lead_atualizado_em"],
    ["update_subscription_updated_at","atualizar_assinatura_atualizado_em"],
    ["fn_archive_leads_on_campaign_end","fn_arquivar_leads_no_fim_campanha"],
    ["fn_assign_ab_variacao","fn_atribuir_ab_variacao"],
    ["retry_failed_scheduled_actions","retentar_acoes_agendadas_falhas"],
    ["expire_subscriptions","expirar_assinaturas"],
    ["export_my_data","exportar_meus_dados"],
    ["request_account_deletion","solicitar_exclusao_conta"],
    ["get_my_parent_user_id","obter_meu_usuario_pai_id"],
    ["get_referral_owner_id","obter_dono_indicacao_id"],
    ["dashboard_stats","estatisticas_painel"],
    ["dashboard_work_data","dados_trabalho_painel"]
  ]'::jsonb;
BEGIN
  FOR pair IN SELECT * FROM jsonb_array_elements(mapeamento) LOOP
    v_velho := pair->>0;
    v_novo := pair->>1;
    
    SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_velho;
    
    IF v_args IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', v_velho, v_args, v_novo);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total trigger functions renomeadas: %', v_count;
END $$;

;

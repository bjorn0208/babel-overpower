
-- Migration 6 — Rename de triggers (renomeio nome do trigger, NÃO da função)
DO $$
DECLARE
  pair JSONB;
  v_tabela TEXT;
  v_velho TEXT;
  v_novo TEXT;
  v_count INT := 0;
  mapeamento JSONB := '[
    ["admin_ia_blocos","trg_admin_ia_chunks_embed","trg_admin_ia_blocos_embed"],
    ["admin_ia_blocos","trg_admin_ia_chunks_updated","trg_admin_ia_blocos_atualizado"],
    ["automacao_blocos","trg_enqueue_embedding_automacao_chunks","trg_enqueue_embedding_automacao_blocos"],
    ["automacao_blocos","trg_enqueue_embedding_automacao_chunks_upd","trg_enqueue_embedding_automacao_blocos_upd"],
    ["blocos_comportamento","trg_enqueue_embedding_behavior","trg_enqueue_embedding_comportamento"],
    ["blocos_comportamento","trg_enqueue_embedding_behavior_upd","trg_enqueue_embedding_comportamento_upd"],
    ["blocos_comportamento","trg_set_updated_at_behavior","trg_set_atualizado_em_comportamento"],
    ["blocos_conhecimento","trg_enqueue_embedding_knowledge","trg_enqueue_embedding_conhecimento"],
    ["blocos_conhecimento","trg_enqueue_embedding_knowledge_upd","trg_enqueue_embedding_conhecimento_upd"],
    ["blocos_conhecimento","trg_knowledge_chunks_fts","trg_blocos_conhecimento_fts"],
    ["blocos_conhecimento","trg_set_updated_at_knowledge","trg_set_atualizado_em_conhecimento"],
    ["blocos_gatilho","trg_enqueue_embedding_trigger","trg_enqueue_embedding_gatilho"],
    ["blocos_gatilho","trg_enqueue_embedding_trigger_upd","trg_enqueue_embedding_gatilho_upd"],
    ["blocos_gatilho","trg_set_updated_at_trigger","trg_set_atualizado_em_gatilho"],
    ["blocos_humanizacao","trg_enqueue_embedding_human","trg_enqueue_embedding_humanizacao"],
    ["blocos_humanizacao","trg_enqueue_embedding_human_upd","trg_enqueue_embedding_humanizacao_upd"],
    ["blocos_humanizacao","trg_set_updated_at_human","trg_set_atualizado_em_humanizacao"],
    ["blocos_meta","trg_set_updated_at_meta_chunks","trg_set_atualizado_em_blocos_meta"],
    ["blocos_padrao","tg_golden_chunks_atualizado_em","tg_blocos_padrao_atualizado_em"],
    ["blocos_procedurais","trg_enqueue_embedding_procedural","trg_enqueue_embedding_procedurais"],
    ["blocos_procedurais","trg_set_updated_at_procedural","trg_set_atualizado_em_procedurais"],
    ["blocos_variacao","trg_enqueue_embedding_variation","trg_enqueue_embedding_variacao"],
    ["blocos_variacao","trg_enqueue_embedding_variation_upd","trg_enqueue_embedding_variacao_upd"],
    ["blocos_variacao","trg_set_updated_at_variation","trg_set_atualizado_em_variacao"],
    ["caixa_saida_mensagens","trg_message_outbox_updated_at","trg_caixa_saida_mensagens_atualizado_em"],
    ["candidatos_bloco","trg_anti_n1_chunk_candidates","trg_anti_n1_candidatos_bloco_v2"],
    ["candidatos_bloco","trg_set_atualizado_em_chunk_candidates","trg_set_atualizado_em_candidatos_bloco"],
    ["candidatos_tag","trg_anti_n1_tag_candidates","trg_anti_n1_candidatos_tag"],
    ["candidatos_tag","trg_set_atualizado_em_tag_candidates","trg_set_atualizado_em_candidatos_tag"],
    ["agentes_usuario","set_updated_at_user_agents","set_atualizado_em_agentes_usuario"],
    ["assinaturas_usuario","trigger_subscription_updated_at","gatilho_assinatura_atualizado_em"],
    ["agendamentos_config","sync_cronjob_config_delete_trigger","sync_config_cronjob_excluir_gatilho"],
    ["agendamentos_config","sync_cronjob_config_trigger","sync_config_cronjob_gatilho"],
    ["campanhas","campaigns_seed_phases","campanhas_popular_fases"],
    ["campanhas","trg_archive_leads_on_campaign_end","trg_arquivar_leads_no_fim_campanha"],
    ["campos_ficha","ficha_form_campos_updated_at","campos_ficha_atualizado_em"],
    ["conversas","trg_audit_conversations","trg_auditar_conversas"],
    ["crenca_conversa","trg_set_updated_at_conversation_belief","trg_set_atualizado_em_crenca_conversa"],
    ["depoimentos_publicos","tg_public_testimonial_delete_rag","tg_publico_excluir_depoimento_rag"],
    ["depoimentos_publicos","tg_public_testimonial_to_rag","tg_publico_depoimento_para_rag"],
    ["engajamento_lead","trg_lead_engagement_updated_at","trg_engajamento_lead_atualizado_em"],
    ["fichas_lead","lead_cards_updated_at","fichas_lead_atualizado_em"],
    ["fichas_lead","trg_sync_lead_tags","trg_sincronizar_tags_lead"],
    ["fichas_lead","trg_sync_pipeline_stage","trg_sincronizar_fase_pipeline"],
    ["leads","trg_derive_tags_on_dados_ficha","trg_derivar_tags_em_dados_ficha"],
    ["leads_campanha","trg_campaign_leads_sync_conv","trg_leads_campanha_sync_conv"],
    ["leads_campanha","trigger_assign_ab_variacao","gatilho_atribuir_ab_variacao"],
    ["memoria_episodica","trg_enqueue_embedding_episodic","trg_enqueue_embedding_episodica"],
    ["memoria_episodica","trg_enqueue_embedding_episodic_upd","trg_enqueue_embedding_episodica_upd"],
    ["memoria_episodica","trg_set_atualizado_em_episodic_memory","trg_set_atualizado_em_memoria_episodica"],
    ["memoria_lead","trg_enqueue_embedding_leadmem","trg_enqueue_embedding_memoria_lead"],
    ["memoria_lead","trg_enqueue_embedding_leadmem_upd","trg_enqueue_embedding_memoria_lead_upd"],
    ["memoria_lead","trg_lead_memory_atualizado_em","trg_memoria_lead_atualizado_em"],
    ["mensagens","trg_record_conversation_ticket","trg_registrar_ticket_conversa"],
    ["mensagens","trg_touch_conversation_on_message","trg_tocar_conversa_em_mensagem"],
    ["meta_indicacao_campanha","campaign_indicacao_meta_updated_at","meta_indicacao_campanha_atualizado_em"],
    ["perfil_publico","tg_public_profile_updated_at","tg_perfil_publico_atualizado_em"],
    ["perguntas_orfas","tg_orphan_questions_atualizado_em","tg_perguntas_orfas_atualizado_em"],
    ["pivots_categoria_intent","trg_enqueue_embedding_intent_pivots_insert","trg_enqueue_embedding_pivots_intent_insert"],
    ["pivots_categoria_intent","trg_enqueue_embedding_intent_pivots_update","trg_enqueue_embedding_pivots_intent_update"],
    ["produto_midias","trg_cleanup_fluxo_on_produto_midia_delete","trg_limpar_fluxo_ao_excluir_produto_midia"],
    ["produtos","trg_cleanup_fluxo_on_produto_delete","trg_limpar_fluxo_ao_excluir_produto"],
    ["profiles","trg_copy_produto_templates","trg_copiar_templates_produto"],
    ["profiles","trg_prevent_critical_field_change","trg_prevenir_mudanca_campo_critico"],
    ["rollouts_canario","tg_canary_rollouts_atualizado_em","tg_rollouts_canario_atualizado_em"],
    ["empresas","re_atomizar_empresa_after_update","re_atomizar_empresa_apos_atualizar"]
  ]'::jsonb;
BEGIN
  FOR pair IN SELECT * FROM jsonb_array_elements(mapeamento) LOOP
    v_tabela := pair->>0;
    v_velho := pair->>1;
    v_novo := pair->>2;
    
    IF EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               WHERE c.relname = v_tabela AND t.tgname = v_velho AND NOT t.tgisinternal) THEN
      EXECUTE format('ALTER TRIGGER %I ON public.%I RENAME TO %I', v_velho, v_tabela, v_novo);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total triggers renomeados: %', v_count;
END $$;

;

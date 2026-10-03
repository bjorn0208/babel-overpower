
-- Migration 4 — Rename policies (60 itens)
DO $$
DECLARE
  pair JSONB;
  v_tabela TEXT;
  v_velho TEXT;
  v_novo TEXT;
  v_count INT := 0;
  mapeamento JSONB := '[
    ["admin_ia_acoes","admin_ia_actions_platform_admin_insert","admin_ia_acoes_admin_plataforma_insert"],
    ["admin_ia_acoes","admin_ia_actions_platform_admin_select","admin_ia_acoes_admin_plataforma_select"],
    ["admin_ia_acoes","admin_ia_actions_service_role_update","admin_ia_acoes_service_role_update"],
    ["admin_ia_blocos","admin_ia_chunks_platform_admin","admin_ia_blocos_admin_plataforma"],
    ["admin_ia_blocos","admin_ia_chunks_service_role_all","admin_ia_blocos_service_role_all"],
    ["admin_ia_reflexao","admin_ia_reflection_platform_admin","admin_ia_reflexao_admin_plataforma"],
    ["assinaturas_usuario","admin_all_subs","admin_all_assinaturas"],
    ["automacao_blocos","automacao_chunks_admin_all","automacao_blocos_admin_all"],
    ["automacao_blocos","automacao_chunks_tenant_read","automacao_blocos_tenant_read"],
    ["blocos_comportamento","admin_all_behavior_chunks","admin_all_blocos_comportamento"],
    ["blocos_comportamento","service_role_all_chunks","service_role_all_blocos"],
    ["blocos_comportamento","tenant_read_chunks","tenant_read_blocos"],
    ["blocos_comportamento","tenant_write_chunks","tenant_write_blocos"],
    ["blocos_conhecimento","admin_read_knowledge_chunks","admin_read_blocos_conhecimento"],
    ["blocos_conhecimento","srv_knowledge_chunks","srv_blocos_conhecimento"],
    ["blocos_conhecimento","user_read_own_chunks","user_read_own_blocos"],
    ["blocos_gatilho","admin_all_trigger_chunks","admin_all_blocos_gatilho"],
    ["blocos_gatilho","tenant_read_trigger_chunks","tenant_read_blocos_gatilho"],
    ["blocos_gatilho","tenant_write_trigger_chunks","tenant_write_blocos_gatilho"],
    ["blocos_humanizacao","admin_all_human_chunks","admin_all_blocos_humanizacao"],
    ["blocos_humanizacao","tenant_read_human_chunks","tenant_read_blocos_humanizacao"],
    ["blocos_humanizacao","tenant_write_human_chunks","tenant_write_blocos_humanizacao"],
    ["blocos_meta","admin_all_meta_chunks","admin_all_blocos_meta"],
    ["blocos_meta","srv_meta_chunks","srv_blocos_meta"],
    ["blocos_meta","tenant_delete_own_meta_chunks","tenant_delete_own_blocos_meta"],
    ["blocos_meta","tenant_read_meta_chunks","tenant_read_blocos_meta"],
    ["blocos_meta","tenant_update_own_meta_chunks","tenant_update_own_blocos_meta"],
    ["blocos_meta","tenant_write_meta_chunks","tenant_write_blocos_meta"],
    ["blocos_padrao","golden_chunks_admin_all","blocos_padrao_admin_all"],
    ["blocos_procedurais","service_role_all_procedural_chunks","service_role_all_blocos_procedurais"],
    ["blocos_procedurais","tenant_read_procedural_chunks","tenant_read_blocos_procedurais"],
    ["blocos_variacao","admin_all_variation_chunks","admin_all_blocos_variacao"],
    ["blocos_variacao","tenant_write_variation_chunks","tenant_write_blocos_variacao"],
    ["cache_kv","srv_kv_cache","srv_cache_kv"],
    ["candidatos_tag","tag_candidates_admin_all","candidatos_tag_admin_all"],
    ["conversas","admin_delete_conversations","admin_excluir_conversas"],
    ["dedup_webhook","service_role_only_webhook_dedup","service_role_only_dedup_webhook"],
    ["emocao_blocos","emocao_chunks_global_read","emocao_blocos_global_read"],
    ["emocao_blocos","emocao_chunks_tenant_all","emocao_blocos_tenant_all"],
    ["engajamento_lead","admin_all_lead_engagement","admin_all_engajamento_lead"],
    ["estado_digitacao","auth_read_typing_state","auth_read_estado_digitacao"],
    ["estado_digitacao","service_role_only_typing_state","service_role_only_estado_digitacao"],
    ["fichas_lead","admin_read_lead_cards","admin_read_fichas_lead"],
    ["fichas_lead","srv_lead_cards","srv_fichas_lead"],
    ["fichas_lead","user_read_lead_cards","user_read_fichas_lead"],
    ["fichas_lead","user_update_lead_cards","user_update_fichas_lead"],
    ["leads","admin_delete_leads","admin_excluir_leads"],
    ["logs_requisicao_llm","admin_all_llm_request_logs","admin_all_logs_requisicao_llm"],
    ["manipulacao_blocos","manipulacao_chunks_read","manipulacao_blocos_read"],
    ["manipulacao_blocos","manipulacao_chunks_tenant_write","manipulacao_blocos_tenant_write"],
    ["memoria_lead","lead_memory_service_role","memoria_lead_service_role"],
    ["memoria_lead","lead_memory_tenant_delete","memoria_lead_tenant_delete"],
    ["memoria_lead","lead_memory_tenant_insert","memoria_lead_tenant_insert"],
    ["memoria_lead","lead_memory_tenant_select","memoria_lead_tenant_select"],
    ["memoria_lead","lead_memory_tenant_update","memoria_lead_tenant_update"],
    ["modelos_llm","admin_all_llm_models","admin_all_modelos_llm"],
    ["modelos_llm","user_read_llm_models","user_read_modelos_llm"],
    ["provedores_llm","admin_all_llm_providers","admin_all_provedores_llm"],
    ["registro_fusao_tag","tag_merge_log_admin_all","registro_fusao_tag_admin_all"],
    ["sugestoes_fusao_tag","tag_merge_suggestions_admin_all","sugestoes_fusao_tag_admin_all"],
    ["travas_lead","service_role_only_lead_locks","service_role_only_travas_lead"]
  ]'::jsonb;
BEGIN
  FOR pair IN SELECT * FROM jsonb_array_elements(mapeamento) LOOP
    v_tabela := pair->>0;
    v_velho := pair->>1;
    v_novo := pair->>2;
    
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tabela AND policyname=v_velho) THEN
      EXECUTE format('ALTER POLICY %I ON public.%I RENAME TO %I', v_velho, v_tabela, v_novo);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total policies renomeadas: %', v_count;
END $$;

;


-- Migration 10 — Rename FKs com nomes velhos (refletem nomes de tabelas pós Big-Bang)
DO $$
DECLARE
  r RECORD;
  v_novo TEXT;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT 
      c.conname as fk_nome,
      cl.relname as tabela
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND c.contype = 'f'
      AND (
        c.conname ~ '^(acao_pausa_chunks|scheduled_actions|admin_ia_reflection|user_subscriptions|automacao_chunks|behavior_chunks|knowledge_chunks|trigger_chunks|human_chunks|meta_chunks|golden_chunks|procedural_chunks|variation_chunks|message_outbox|campaigns|chunk_candidates|tag_candidates|conversation_belief|diretriz_bolha_chunks|emocao_chunks|lead_engagement|typing_state|lead_cards|campaign_leads|llm_request_logs|manipulacao_chunks|episodic_memory|lead_memory|llm_models|prova_social_chunks|tag_merge_log|regras_operacionais_chunks|tag_merge_suggestions|lead_locks)_'
      )
  LOOP
    v_novo := r.fk_nome;
    -- Substituições em ordem específica (mais longas primeiro pra evitar overlap)
    v_novo := regexp_replace(v_novo, '^acao_pausa_chunks_', 'acao_pausa_blocos_');
    v_novo := regexp_replace(v_novo, '^scheduled_actions_', 'acoes_agendadas_');
    v_novo := regexp_replace(v_novo, '^admin_ia_reflection_', 'admin_ia_reflexao_');
    v_novo := regexp_replace(v_novo, '^user_subscriptions_', 'assinaturas_usuario_');
    v_novo := regexp_replace(v_novo, '^automacao_chunks_', 'automacao_blocos_');
    v_novo := regexp_replace(v_novo, '^behavior_chunks_tenant_overrides_', 'overrides_tenant_blocos_comportamento_');
    v_novo := regexp_replace(v_novo, '^behavior_chunks_', 'blocos_comportamento_');
    v_novo := regexp_replace(v_novo, '^knowledge_chunks_tenant_overrides_', 'overrides_tenant_blocos_conhecimento_');
    v_novo := regexp_replace(v_novo, '^knowledge_chunks_', 'blocos_conhecimento_');
    v_novo := regexp_replace(v_novo, '^trigger_chunks_tenant_overrides_', 'overrides_tenant_blocos_gatilho_');
    v_novo := regexp_replace(v_novo, '^trigger_chunks_', 'blocos_gatilho_');
    v_novo := regexp_replace(v_novo, '^human_chunks_tenant_overrides_', 'overrides_tenant_blocos_humanizacao_');
    v_novo := regexp_replace(v_novo, '^human_chunks_', 'blocos_humanizacao_');
    v_novo := regexp_replace(v_novo, '^meta_chunks_tenant_overrides_', 'overrides_tenant_blocos_meta_');
    v_novo := regexp_replace(v_novo, '^meta_chunks_', 'blocos_meta_');
    v_novo := regexp_replace(v_novo, '^golden_chunks_', 'blocos_padrao_');
    v_novo := regexp_replace(v_novo, '^procedural_chunks_', 'blocos_procedurais_');
    v_novo := regexp_replace(v_novo, '^variation_chunks_tenant_overrides_', 'overrides_tenant_blocos_variacao_');
    v_novo := regexp_replace(v_novo, '^variation_chunks_', 'blocos_variacao_');
    v_novo := regexp_replace(v_novo, '^message_outbox_', 'caixa_saida_mensagens_');
    v_novo := regexp_replace(v_novo, '^campaigns_', 'campanhas_');
    v_novo := regexp_replace(v_novo, '^chunk_candidates_', 'candidatos_bloco_');
    v_novo := regexp_replace(v_novo, '^tag_candidates_', 'candidatos_tag_');
    v_novo := regexp_replace(v_novo, '^conversation_belief_', 'crenca_conversa_');
    v_novo := regexp_replace(v_novo, '^diretriz_bolha_chunks_', 'diretriz_bolha_blocos_');
    v_novo := regexp_replace(v_novo, '^emocao_chunks_', 'emocao_blocos_');
    v_novo := regexp_replace(v_novo, '^lead_engagement_', 'engajamento_lead_');
    v_novo := regexp_replace(v_novo, '^typing_state_', 'estado_digitacao_');
    v_novo := regexp_replace(v_novo, '^lead_cards_', 'fichas_lead_');
    v_novo := regexp_replace(v_novo, '^campaign_leads_', 'leads_campanha_');
    v_novo := regexp_replace(v_novo, '^llm_request_logs_', 'logs_requisicao_llm_');
    v_novo := regexp_replace(v_novo, '^manipulacao_chunks_', 'manipulacao_blocos_');
    v_novo := regexp_replace(v_novo, '^episodic_memory_', 'memoria_episodica_');
    v_novo := regexp_replace(v_novo, '^lead_memory_', 'memoria_lead_');
    v_novo := regexp_replace(v_novo, '^llm_models_', 'modelos_llm_');
    v_novo := regexp_replace(v_novo, '^prova_social_chunks_', 'prova_social_blocos_');
    v_novo := regexp_replace(v_novo, '^tag_merge_log_', 'registro_fusao_tag_');
    v_novo := regexp_replace(v_novo, '^regras_operacionais_chunks_', 'regras_operacionais_blocos_');
    v_novo := regexp_replace(v_novo, '^tag_merge_suggestions_', 'sugestoes_fusao_tag_');
    v_novo := regexp_replace(v_novo, '^lead_locks_', 'travas_lead_');
    
    IF v_novo != r.fk_nome THEN
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', r.tabela, r.fk_nome, v_novo);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total FKs renomeadas: %', v_count;
END $$;

-- Validação: count == 0
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE n.nspname = 'public' AND c.contype = 'f'
    AND c.conname ~ '^(acao_pausa_chunks|scheduled_actions|admin_ia_reflection|user_subscriptions|automacao_chunks|behavior_chunks|knowledge_chunks|trigger_chunks|human_chunks|meta_chunks|golden_chunks|procedural_chunks|variation_chunks|message_outbox|campaigns|chunk_candidates|tag_candidates|conversation_belief|diretriz_bolha_chunks|emocao_chunks|lead_engagement|typing_state|lead_cards|campaign_leads|llm_request_logs|manipulacao_chunks|episodic_memory|lead_memory|llm_models|prova_social_chunks|tag_merge_log|regras_operacionais_chunks|tag_merge_suggestions|lead_locks)_';
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Validação falhou: % FKs com nome velho ainda existem', v_count;
  END IF;
END $$;

;

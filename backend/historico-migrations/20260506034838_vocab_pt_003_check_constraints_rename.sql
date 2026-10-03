
-- Migration 3 — Rename CHECK constraints (nomes apenas, valores ficam pra próxima onda)
-- Refletem nomes novos das tabelas pós Big-Bang Rename.

DO $$
DECLARE
  pair JSONB;
  v_tabela TEXT;
  v_velho TEXT;
  v_novo TEXT;
  v_count INT := 0;
  mapeamento JSONB := '[
    ["acao_pausa_blocos","acao_pausa_chunks_embedding_status_check","acao_pausa_blocos_embedding_status_check"],
    ["admin_ia_base_academica","admin_ia_kb_academica_embedding_status_check","admin_ia_base_academica_embedding_status_check"],
    ["admin_ia_blocos","admin_ia_chunks_embedding_status_check","admin_ia_blocos_embedding_status_check"],
    ["assinaturas_usuario","user_subscriptions_status_check","assinaturas_usuario_status_check"],
    ["automacao_blocos","automacao_chunks_embedding_status_check","automacao_blocos_embedding_status_check"],
    ["blocos_comportamento","behavior_chunks_embedding_status_check","blocos_comportamento_embedding_status_check"],
    ["blocos_conhecimento","knowledge_chunks_embedding_status_check","blocos_conhecimento_embedding_status_check"],
    ["blocos_gatilho","trigger_chunks_embedding_status_check","blocos_gatilho_embedding_status_check"],
    ["blocos_humanizacao","human_chunks_embedding_status_check","blocos_humanizacao_embedding_status_check"],
    ["blocos_meta","meta_chunks_embedding_status_check","blocos_meta_embedding_status_check"],
    ["blocos_procedurais","procedural_chunks_embedding_status_check","blocos_procedurais_embedding_status_check"],
    ["blocos_variacao","variation_chunks_embedding_status_check","blocos_variacao_embedding_status_check"],
    ["caixa_saida_mensagens","message_outbox_status_check","caixa_saida_mensagens_status_check"],
    ["campanhas","campaigns_status_check","campanhas_status_check"],
    ["candidatos_bloco","chunk_candidates_status_check","candidatos_bloco_status_check"],
    ["candidatos_tag","tag_candidates_status_check","candidatos_tag_status_check"],
    ["diretriz_bolha_blocos","diretriz_bolha_chunks_embedding_status_check","diretriz_bolha_blocos_embedding_status_check"],
    ["emocao_blocos","emocao_chunks_embedding_status_check","emocao_blocos_embedding_status_check"],
    ["manipulacao_blocos","manipulacao_chunks_embedding_status_check","manipulacao_blocos_embedding_status_check"],
    ["memoria_episodica","episodic_memory_embedding_status_check","memoria_episodica_embedding_status_check"],
    ["memoria_lead","lead_memory_embedding_status_check","memoria_lead_embedding_status_check"],
    ["pivots_categoria_intent","intent_categoria_pivots_embedding_status_check","pivots_categoria_intent_embedding_status_check"],
    ["prova_social_blocos","prova_social_chunks_embedding_status_check","prova_social_blocos_embedding_status_check"],
    ["regras_operacionais_blocos","regras_operacionais_chunks_embedding_status_check","regras_operacionais_blocos_embedding_status_check"],
    ["sugestoes_fusao_tag","tag_merge_suggestions_status_check","sugestoes_fusao_tag_status_check"]
  ]'::jsonb;
BEGIN
  FOR pair IN SELECT * FROM jsonb_array_elements(mapeamento) LOOP
    v_tabela := pair->>0;
    v_velho := pair->>1;
    v_novo := pair->>2;
    
    IF EXISTS (SELECT 1 FROM pg_constraint c
               JOIN pg_class cl ON cl.oid = c.conrelid
               WHERE cl.relname = v_tabela AND c.conname = v_velho) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', v_tabela, v_velho, v_novo);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total CHECK constraints renomeadas: %', v_count;
END $$;

;

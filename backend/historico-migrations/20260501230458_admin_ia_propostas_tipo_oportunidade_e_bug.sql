-- Adiciona 'oportunidade' (Onda 4 curiosidade) e 'bug_sistemico' (Sprint 3 auditor) como tipos válidos
ALTER TABLE public.admin_ia_propostas DROP CONSTRAINT IF EXISTS admin_ia_propostas_tipo_check;
ALTER TABLE public.admin_ia_propostas ADD CONSTRAINT admin_ia_propostas_tipo_check
CHECK (tipo = ANY (ARRAY[
  'rag_admin_chunk', 'rag_admin_chunk_edit', 'chunk_platform', 'chunk_platform_edit',
  'chunk_knowledge', 'chunk_behavior', 'chunk_trigger', 'chunk_human', 'chunk_variation',
  'chunk_meta', 'chunk_procedural', 'chunk_emocao', 'chunk_prova_social', 'chunk_manipulacao',
  'chunk_diretriz_bolha', 'chunk_automacao', 'chunk_acao_pausa', 'chunk_regras_operacionais',
  'mudanca_fase', 'mudanca_pipeline', 'vocab_canonico', 'vocab_alias', 'vocabulario',
  'automacao_semantica', 'threshold', 'calibracao_threshold', 'override_tenant',
  'cronjob', 'tool_admin', 'atualizar_ficha_lead',
  'oportunidade', 'bug_sistemico'
]));
;

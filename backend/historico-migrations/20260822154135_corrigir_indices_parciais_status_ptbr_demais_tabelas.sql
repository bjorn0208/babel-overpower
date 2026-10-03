-- Varredura pós-incidente 2026-08-22: mais 7 índices parciais criados antes do
-- Big-Bang Rename com predicado nos status em inglês ('pending'/'active') que
-- nunca casam com os dados reais em PT-BR ('pendente'/'ativa'). Índices mortos:
-- não servem consulta e o único (sugestoes_fusao_tag) nem garantia unicidade.
-- Obs: action_type 'campaign%' segue EN por ser valor de dado vivo (fora do escopo).
-- Down: recriar os índices antigos com os predicados 'pending'/'active'.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DROP INDEX IF EXISTS public.idx_scheduled_actions_campaign_pending;
CREATE INDEX IF NOT EXISTS idx_acoes_agendadas_campanha_pendente
  ON public.acoes_agendadas (campaign_id, status, scheduled_at)
  WHERE action_type LIKE 'campaign%' AND status = 'pendente';

DROP INDEX IF EXISTS public.idx_campaigns_tenant_type;
CREATE INDEX IF NOT EXISTS idx_campanhas_tenant_tipo_ativa
  ON public.campanhas (tenant_id, type)
  WHERE status = 'ativa';

DROP INDEX IF EXISTS public.idx_tag_merge_pair_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fusao_tag_par_unico_pendente
  ON public.sugestoes_fusao_tag (tenant_id, LEAST(tag_a, tag_b), GREATEST(tag_a, tag_b))
  WHERE status = 'pendente';

DROP INDEX IF EXISTS public.idx_tag_merge_pending;
CREATE INDEX IF NOT EXISTS idx_fusao_tag_pendente
  ON public.sugestoes_fusao_tag (tenant_id, criado_em DESC)
  WHERE status = 'pendente';

DROP INDEX IF EXISTS public.idx_chunk_candidates_pending;
CREATE INDEX IF NOT EXISTS idx_candidatos_bloco_pendente
  ON public.candidatos_bloco (tenant_id, criado_em DESC)
  WHERE status = 'pendente';

DROP INDEX IF EXISTS public.idx_tag_candidates_pending;
CREATE INDEX IF NOT EXISTS idx_candidatos_tag_pendente
  ON public.candidatos_tag (tenant_id, num_leads_independentes DESC)
  WHERE status = 'pendente';

DROP INDEX IF EXISTS public.idx_episodic_memory_embedding_pending;
CREATE INDEX IF NOT EXISTS idx_memoria_episodica_vetor_pendente
  ON public.memoria_episodica (criado_em)
  WHERE embedding_status = 'pendente';
;

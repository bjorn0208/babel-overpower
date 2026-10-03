
-- Sprint C · Migration 013 · Índices completos pras FKs (advisor performance)

CREATE INDEX IF NOT EXISTS idx_chunk_candidates_conversation_fk
  ON public.chunk_candidates (conversation_id);
CREATE INDEX IF NOT EXISTS idx_chunk_candidates_decided_by_fk
  ON public.chunk_candidates (decided_by);
CREATE INDEX IF NOT EXISTS idx_chunk_candidates_lead_id_fk
  ON public.chunk_candidates (lead_id);

CREATE INDEX IF NOT EXISTS idx_episodic_memory_conversation_fk
  ON public.episodic_memory (conversation_id);
CREATE INDEX IF NOT EXISTS idx_episodic_memory_lead_fk
  ON public.episodic_memory (lead_id);

CREATE INDEX IF NOT EXISTS idx_tag_merge_log_applied_by_fk
  ON public.tag_merge_log (applied_by);
CREATE INDEX IF NOT EXISTS idx_tag_merge_log_origem_suggestion_fk
  ON public.tag_merge_log (origem_suggestion_id);

CREATE INDEX IF NOT EXISTS idx_tag_merge_suggestions_decided_by_fk
  ON public.tag_merge_suggestions (decided_by);

CREATE INDEX IF NOT EXISTS idx_tag_observations_conversation_fk
  ON public.tag_observations (conversation_id);
CREATE INDEX IF NOT EXISTS idx_tag_observations_lead_fk
  ON public.tag_observations (lead_id);

;

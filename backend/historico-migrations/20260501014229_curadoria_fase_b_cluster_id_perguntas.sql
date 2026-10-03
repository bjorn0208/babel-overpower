-- Fase B Curadoria · ponte entre perguntas_sem_resposta e orphan_questions
-- Additive-only, zero risco. Permite cron-cluster-gaps escrever cluster_id
-- e o LabGaps drilldown ficar preciso (não mais heurístico textual).

ALTER TABLE public.perguntas_sem_resposta
  ADD COLUMN IF NOT EXISTS cluster_id text;

CREATE INDEX IF NOT EXISTS perguntas_sem_resposta_tenant_cluster_idx
  ON public.perguntas_sem_resposta (tenant_id, cluster_id)
  WHERE cluster_id IS NOT NULL;

COMMENT ON COLUMN public.perguntas_sem_resposta.cluster_id IS
  'Liga a pergunta ao cluster em orphan_questions.cluster_id (escrito pelo cron-cluster-gaps).';

;

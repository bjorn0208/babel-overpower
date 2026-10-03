-- Onda 2 (manifesto): 7 views sem callers estáticos confirmados; 5 índices vetoriais idx_scan=0.
-- Buckets storage: bloqueado por protect_delete — remover via Storage API / Dashboard.

DROP VIEW IF EXISTS public.v_conversas_status_dia;
DROP VIEW IF EXISTS public.v_crenca_taxa;
DROP VIEW IF EXISTS public.v_custo_por_modelo_dia;
DROP VIEW IF EXISTS public.v_ficha_form_valores_atual;
DROP VIEW IF EXISTS public.v_saude_cronjobs;
DROP VIEW IF EXISTS public.v_saude_perfil;
DROP VIEW IF EXISTS public.v_top_erros_dia;

DROP INDEX IF EXISTS public.tag_candidates_embedding_ivf;
DROP INDEX IF EXISTS public.lead_memory_embedding_hnsw;
DROP INDEX IF EXISTS public.knowledge_chunks_embedding_hnsw;
DROP INDEX IF EXISTS public.trigger_chunks_embedding_hnsw;
DROP INDEX IF EXISTS public.idx_episodic_memory_embedding_hnsw;

;

CREATE INDEX CONCURRENTLY IF NOT EXISTS blocos_conhecimento_vetor_hnsw ON public.blocos_conhecimento USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
;

CREATE INDEX CONCURRENTLY IF NOT EXISTS memoria_episodica_vetor_hnsw ON public.memoria_episodica USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
;

-- F2a Migração Cohere→Voyage: colunas vetor_semantico 1536→1024 + recria índices.
-- Zera os vetores Cohere (já inúteis: Cohere fora por billing) + marca pendente pro re-embed Voyage.
DROP INDEX IF EXISTS public.acao_pausa_embedding_idx;
UPDATE public.acao_pausa_blocos SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.acao_pausa_blocos ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX acao_pausa_embedding_idx ON public.acao_pausa_blocos USING hnsw (vetor_semantico halfvec_cosine_ops) WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.agente_identidade_embedding_hnsw;
UPDATE public.agente_identidade SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.agente_identidade ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX agente_identidade_embedding_hnsw ON public.agente_identidade USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.anti_padroes_embedding_hnsw;
UPDATE public.anti_padroes SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.anti_padroes ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX anti_padroes_embedding_hnsw ON public.anti_padroes USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.automacao_chunks_embedding_idx;
UPDATE public.automacao_blocos SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.automacao_blocos ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX automacao_chunks_embedding_idx ON public.automacao_blocos USING hnsw (vetor_semantico halfvec_cosine_ops) WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.idx_avisos_curadoria_vetor;
UPDATE public.avisos_curadoria SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.avisos_curadoria ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX idx_avisos_curadoria_vetor ON public.avisos_curadoria USING hnsw (vetor_semantico halfvec_cosine_ops) WHERE ((embedding_status = 'pronto'::text) AND (deleted_at IS NULL));

DROP INDEX IF EXISTS public.behavior_chunks_embedding_hnsw;
UPDATE public.blocos_comportamento SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.blocos_comportamento ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX behavior_chunks_embedding_hnsw ON public.blocos_comportamento USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

UPDATE public.blocos_conhecimento SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.blocos_conhecimento ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);

UPDATE public.blocos_gatilho SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.blocos_gatilho ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);

DROP INDEX IF EXISTS public.human_chunks_embedding_hnsw;
UPDATE public.blocos_humanizacao SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.blocos_humanizacao ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX human_chunks_embedding_hnsw ON public.blocos_humanizacao USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

UPDATE public.blocos_meta SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.blocos_meta ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);

UPDATE public.blocos_procedurais SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.blocos_procedurais ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);

DROP INDEX IF EXISTS public.variation_chunks_embedding_hnsw;
UPDATE public.blocos_variacao SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.blocos_variacao ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX variation_chunks_embedding_hnsw ON public.blocos_variacao USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.tag_candidates_tenant_status_idx;
DROP INDEX IF EXISTS public.tag_candidates_nicho_status_idx;
UPDATE public.candidatos_tag SET vetor_semantico = NULL;
ALTER TABLE public.candidatos_tag ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX tag_candidates_tenant_status_idx ON public.candidatos_tag USING btree (tenant_id, status) WHERE (vetor_semantico IS NULL);
CREATE INDEX tag_candidates_nicho_status_idx ON public.candidatos_tag USING btree (nicho_id, status) WHERE (vetor_semantico IS NULL);

DROP INDEX IF EXISTS public.diretriz_bolha_embedding_hnsw;
UPDATE public.diretriz_bolha_blocos SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.diretriz_bolha_blocos ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX diretriz_bolha_embedding_hnsw ON public.diretriz_bolha_blocos USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.emocao_chunks_embedding_hnsw;
UPDATE public.emocao_blocos SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.emocao_blocos ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX emocao_chunks_embedding_hnsw ON public.emocao_blocos USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.fase_requisitos_embedding_hnsw;
UPDATE public.fase_requisitos SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.fase_requisitos ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX fase_requisitos_embedding_hnsw ON public.fase_requisitos USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.ferramentas_dinamicas_vetor_hnsw;
UPDATE public.ferramentas_dinamicas SET vetor_semantico = NULL;
ALTER TABLE public.ferramentas_dinamicas ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX ferramentas_dinamicas_vetor_hnsw ON public.ferramentas_dinamicas USING hnsw (vetor_semantico halfvec_cosine_ops);

DROP INDEX IF EXISTS public.manipulacao_embedding_hnsw;
UPDATE public.manipulacao_blocos SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.manipulacao_blocos ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX manipulacao_embedding_hnsw ON public.manipulacao_blocos USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

UPDATE public.memoria_episodica SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.memoria_episodica ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);

DROP INDEX IF EXISTS public.memoria_lead_vetor_hnsw;
UPDATE public.memoria_lead SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.memoria_lead ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX memoria_lead_vetor_hnsw ON public.memoria_lead USING hnsw (vetor_semantico halfvec_cosine_ops);

DROP INDEX IF EXISTS public.perguntas_sem_resp_embedding_hnsw;
UPDATE public.perguntas_sem_resposta SET vetor_semantico = NULL;
ALTER TABLE public.perguntas_sem_resposta ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX perguntas_sem_resp_embedding_hnsw ON public.perguntas_sem_resposta USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.intent_pivots_embed_hnsw;
UPDATE public.pivots_categoria_intent SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.pivots_categoria_intent ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX intent_pivots_embed_hnsw ON public.pivots_categoria_intent USING hnsw (vetor_semantico halfvec_cosine_ops) WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.prova_social_embedding_hnsw;
UPDATE public.prova_social_blocos SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.prova_social_blocos ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX prova_social_embedding_hnsw ON public.prova_social_blocos USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64') WHERE (vetor_semantico IS NOT NULL);

DROP INDEX IF EXISTS public.regras_op_embed_hnsw;
UPDATE public.regras_operacionais_blocos SET vetor_semantico = NULL, embedding_status = 'pendente';
ALTER TABLE public.regras_operacionais_blocos ALTER COLUMN vetor_semantico TYPE extensions.halfvec(1024);
CREATE INDEX regras_op_embed_hnsw ON public.regras_operacionais_blocos USING hnsw (vetor_semantico halfvec_cosine_ops) WITH (m='16', ef_construction='64');
;


-- Onda D7: embedding → vetor_semantico em 25 tabelas (24 halfvec + 1 vector)

ALTER TABLE public.acao_pausa_blocos RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.acao_pausa_blocos ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.admin_ia_base_academica RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.admin_ia_base_academica ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.admin_ia_blocos RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.admin_ia_blocos ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.admin_ia_memoria RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.admin_ia_memoria ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.agente_identidade RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.agente_identidade ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.anti_padroes RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.anti_padroes ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.automacao_blocos RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.automacao_blocos ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.blocos_comportamento RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.blocos_comportamento ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.blocos_conhecimento RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.blocos_conhecimento ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.blocos_gatilho RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.blocos_gatilho ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.blocos_humanizacao RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.blocos_humanizacao ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.blocos_meta RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.blocos_meta ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.blocos_procedurais RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.blocos_procedurais ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.blocos_variacao RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.blocos_variacao ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.candidatos_tag RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.candidatos_tag ADD COLUMN embedding vector(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.diretriz_bolha_blocos RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.diretriz_bolha_blocos ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.emocao_blocos RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.emocao_blocos ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.fase_requisitos RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.fase_requisitos ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.manipulacao_blocos RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.manipulacao_blocos ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.memoria_episodica RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.memoria_episodica ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.memoria_lead RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.memoria_lead ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.perguntas_sem_resposta RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.perguntas_sem_resposta ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.pivots_categoria_intent RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.pivots_categoria_intent ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.prova_social_blocos RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.prova_social_blocos ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

ALTER TABLE public.regras_operacionais_blocos RENAME COLUMN embedding TO vetor_semantico;
ALTER TABLE public.regras_operacionais_blocos ADD COLUMN embedding halfvec(1536) GENERATED ALWAYS AS (vetor_semantico) STORED;

;

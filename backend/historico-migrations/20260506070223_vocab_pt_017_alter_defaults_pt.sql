-- Mig 17: ALTER DEFAULT pra valores PT (33 colunas)

-- status (10 tabelas)
ALTER TABLE public.assinaturas_usuario ALTER COLUMN status SET DEFAULT 'ativa';
ALTER TABLE public.acoes_agendadas ALTER COLUMN status SET DEFAULT 'pendente';
ALTER TABLE public.caixa_saida_mensagens ALTER COLUMN status SET DEFAULT 'pendente';
ALTER TABLE public.candidatos_bloco ALTER COLUMN status SET DEFAULT 'pendente';
ALTER TABLE public.candidatos_tag ALTER COLUMN status SET DEFAULT 'pendente';
ALTER TABLE public.contratos ALTER COLUMN status SET DEFAULT 'pendente';
ALTER TABLE public.conversas ALTER COLUMN status SET DEFAULT 'ativa';
ALTER TABLE public.logs_requisicao_llm ALTER COLUMN status SET DEFAULT 'sucesso';
ALTER TABLE public.sugestoes_fusao_tag ALTER COLUMN status SET DEFAULT 'pendente';

-- lead_temperature
ALTER TABLE public.leads ALTER COLUMN lead_temperature SET DEFAULT 'frio';

-- embedding_status (22 tabelas — 'pending'→'pendente', exceto blocos_conhecimento que é 'ready'→'pronto')
ALTER TABLE public.acao_pausa_blocos ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.admin_ia_base_academica ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.admin_ia_blocos ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.admin_ia_memoria ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.agente_identidade ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.anti_padroes ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.automacao_blocos ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.blocos_comportamento ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.blocos_conhecimento ALTER COLUMN embedding_status SET DEFAULT 'pronto';
ALTER TABLE public.blocos_gatilho ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.blocos_humanizacao ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.blocos_meta ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.blocos_procedurais ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.blocos_variacao ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.diretriz_bolha_blocos ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.emocao_blocos ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.fase_requisitos ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.manipulacao_blocos ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.memoria_episodica ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.memoria_lead ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.pivots_categoria_intent ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.prova_social_blocos ALTER COLUMN embedding_status SET DEFAULT 'pendente';
ALTER TABLE public.regras_operacionais_blocos ALTER COLUMN embedding_status SET DEFAULT 'pendente';
;

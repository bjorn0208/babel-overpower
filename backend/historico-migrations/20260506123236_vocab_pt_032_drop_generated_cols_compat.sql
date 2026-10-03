
-- Drop 62 generated cols compat (D1+D2+D3+D4+D5+D6+D7)
-- Plataforma 100% PT no banco — sem nomes EN

-- D1 (7): leads
ALTER TABLE public.leads DROP COLUMN external_channel;
ALTER TABLE public.leads DROP COLUMN external_id;
ALTER TABLE public.leads DROP COLUMN client_tasks;
ALTER TABLE public.leads DROP COLUMN provider_name;
ALTER TABLE public.leads DROP COLUMN lead_source;
ALTER TABLE public.leads DROP COLUMN total_debt;
ALTER TABLE public.leads DROP COLUMN total_messages;

-- D2 (10): leads + canais + leads_campanha
ALTER TABLE public.leads DROP COLUMN pipeline_stage;
ALTER TABLE public.leads DROP COLUMN product;
ALTER TABLE public.leads DROP COLUMN profile_photo_url;
ALTER TABLE public.leads DROP COLUMN display_name;
ALTER TABLE public.leads DROP COLUMN client_stage;
ALTER TABLE public.leads DROP COLUMN style_profile;
ALTER TABLE public.leads DROP COLUMN needs_human_help;
ALTER TABLE public.leads DROP COLUMN lead_temperature;
ALTER TABLE public.canais DROP COLUMN profile_photo_url;
ALTER TABLE public.leads_campanha DROP COLUMN style_profile;

-- D3 (7): agent_id
ALTER TABLE public.acoes_agendadas DROP COLUMN agent_id;
ALTER TABLE public.blocos_conhecimento DROP COLUMN agent_id;
ALTER TABLE public.buffer_mensagens DROP COLUMN agent_id;
ALTER TABLE public.contratos DROP COLUMN agent_id;
ALTER TABLE public.fase_requisitos DROP COLUMN agent_id;
ALTER TABLE public.fichas_lead DROP COLUMN agent_id;
ALTER TABLE public.leads DROP COLUMN agent_id;

-- D4 (6): payload
ALTER TABLE public.acoes_agendadas DROP COLUMN payload;
ALTER TABLE public.admin_ia_propostas DROP COLUMN payload;
ALTER TABLE public.automacao_blocos DROP COLUMN payload;
ALTER TABLE public.caixa_saida_mensagens DROP COLUMN payload;
ALTER TABLE public.debug_webhook DROP COLUMN payload;
ALTER TABLE public.mensagens DROP COLUMN payload;

-- D5 (3): score
ALTER TABLE public.admin_ia_reflexao DROP COLUMN score;
ALTER TABLE public.engajamento_lead DROP COLUMN score;
ALTER TABLE public.leads DROP COLUMN score;

-- D6 (5): token público
ALTER TABLE public.contratos DROP COLUMN token;
ALTER TABLE public.leads DROP COLUMN tracking_token;
ALTER TABLE public.log_acesso_contrato DROP COLUMN token;
ALTER TABLE public.meta_indicacao_campanha DROP COLUMN token;
ALTER TABLE public.sessoes_chat_publico DROP COLUMN session_token;

-- D7 (25): embedding
ALTER TABLE public.acao_pausa_blocos DROP COLUMN embedding;
ALTER TABLE public.admin_ia_base_academica DROP COLUMN embedding;
ALTER TABLE public.admin_ia_blocos DROP COLUMN embedding;
ALTER TABLE public.admin_ia_memoria DROP COLUMN embedding;
ALTER TABLE public.agente_identidade DROP COLUMN embedding;
ALTER TABLE public.anti_padroes DROP COLUMN embedding;
ALTER TABLE public.automacao_blocos DROP COLUMN embedding;
ALTER TABLE public.blocos_comportamento DROP COLUMN embedding;
ALTER TABLE public.blocos_conhecimento DROP COLUMN embedding;
ALTER TABLE public.blocos_gatilho DROP COLUMN embedding;
ALTER TABLE public.blocos_humanizacao DROP COLUMN embedding;
ALTER TABLE public.blocos_meta DROP COLUMN embedding;
ALTER TABLE public.blocos_procedurais DROP COLUMN embedding;
ALTER TABLE public.blocos_variacao DROP COLUMN embedding;
ALTER TABLE public.candidatos_tag DROP COLUMN embedding;
ALTER TABLE public.diretriz_bolha_blocos DROP COLUMN embedding;
ALTER TABLE public.emocao_blocos DROP COLUMN embedding;
ALTER TABLE public.fase_requisitos DROP COLUMN embedding;
ALTER TABLE public.manipulacao_blocos DROP COLUMN embedding;
ALTER TABLE public.memoria_episodica DROP COLUMN embedding;
ALTER TABLE public.memoria_lead DROP COLUMN embedding;
ALTER TABLE public.perguntas_sem_resposta DROP COLUMN embedding;
ALTER TABLE public.pivots_categoria_intent DROP COLUMN embedding;
ALTER TABLE public.prova_social_blocos DROP COLUMN embedding;
ALTER TABLE public.regras_operacionais_blocos DROP COLUMN embedding;

;

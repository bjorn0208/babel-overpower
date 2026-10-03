-- Mig 18 (Sessão F): drop EN dos CHECKs (banco 100% PT já validado)

-- 1. Drop EN do CHECK duplo (5 tabelas com status)
ALTER TABLE public.assinaturas_usuario DROP CONSTRAINT IF EXISTS assinaturas_usuario_status_check;
ALTER TABLE public.assinaturas_usuario ADD CONSTRAINT assinaturas_usuario_status_check 
  CHECK (status = ANY (ARRAY['ativa'::text, 'expirada'::text, 'cancelada'::text, 'suspensa'::text]));

ALTER TABLE public.caixa_saida_mensagens DROP CONSTRAINT IF EXISTS caixa_saida_mensagens_status_check;
ALTER TABLE public.caixa_saida_mensagens ADD CONSTRAINT caixa_saida_mensagens_status_check 
  CHECK (status = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviada'::text, 'falhou'::text, 'substituida'::text]));

ALTER TABLE public.campanhas DROP CONSTRAINT IF EXISTS campanhas_status_check;
ALTER TABLE public.campanhas ADD CONSTRAINT campanhas_status_check 
  CHECK (status = ANY (ARRAY['rascunho'::text, 'ativa'::text, 'pausada'::text, 'finalizada'::text]));

ALTER TABLE public.candidatos_tag DROP CONSTRAINT IF EXISTS candidatos_tag_status_check;
ALTER TABLE public.candidatos_tag ADD CONSTRAINT candidatos_tag_status_check 
  CHECK (status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'rejeitado'::text, 'promovido'::text]));

ALTER TABLE public.sugestoes_fusao_tag DROP CONSTRAINT IF EXISTS sugestoes_fusao_tag_status_check;
ALTER TABLE public.sugestoes_fusao_tag ADD CONSTRAINT sugestoes_fusao_tag_status_check 
  CHECK (status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'rejeitado'::text]));

-- 2. CHECK PT-only nas 5 tabelas que não tinham CHECK em status/coluna
ALTER TABLE public.conversas ADD CONSTRAINT conversas_status_check 
  CHECK (status = ANY (ARRAY['ativa'::text, 'humano'::text, 'encerrada'::text, 'campaign'::text]));

ALTER TABLE public.contratos ADD CONSTRAINT contratos_status_check 
  CHECK (status = ANY (ARRAY['pendente'::text, 'aguardando_validacao'::text, 'assinado'::text, 'rejeitado'::text]));

ALTER TABLE public.leads ADD CONSTRAINT leads_lead_temperature_check 
  CHECK (lead_temperature IS NULL OR lead_temperature = ANY (ARRAY['frio'::text, 'morno'::text, 'quente'::text]));

ALTER TABLE public.acoes_agendadas ADD CONSTRAINT acoes_agendadas_status_check 
  CHECK (status = ANY (ARRAY['pendente'::text, 'cancelado'::text, 'executado'::text, 'falhou'::text, 'processando'::text]));

ALTER TABLE public.logs_requisicao_llm ADD CONSTRAINT logs_requisicao_llm_status_check 
  CHECK (status = ANY (ARRAY['sucesso'::text, 'erro'::text]));

-- 3. Drop EN do CHECK embedding_status (23 tabelas)
DO $$
DECLARE
  v_t_4 text[] := ARRAY['blocos_gatilho','blocos_humanizacao','blocos_meta','blocos_procedurais','blocos_variacao','automacao_blocos','fase_requisitos','memoria_episodica','memoria_lead','acao_pausa_blocos','blocos_comportamento'];
  v_t_3a text[] := ARRAY['blocos_conhecimento','diretriz_bolha_blocos','emocao_blocos','agente_identidade','anti_padroes','regras_operacionais_blocos','manipulacao_blocos','pivots_categoria_intent','prova_social_blocos'];
  v_t_4b text[] := ARRAY['admin_ia_memoria','admin_ia_blocos'];
  v_tabela text;
BEGIN
  FOREACH v_tabela IN ARRAY v_t_4 LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tabela, v_tabela || '_embedding_status_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (embedding_status = ANY (ARRAY[''pendente''::text, ''processando''::text, ''pronto''::text, ''falhou''::text]))',
      v_tabela, v_tabela || '_embedding_status_check'
    );
  END LOOP;
  FOREACH v_tabela IN ARRAY v_t_3a LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tabela, v_tabela || '_embedding_status_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (embedding_status = ANY (ARRAY[''pendente''::text, ''pronto''::text, ''erro''::text]))',
      v_tabela, v_tabela || '_embedding_status_check'
    );
  END LOOP;
  FOREACH v_tabela IN ARRAY v_t_4b LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tabela, v_tabela || '_embedding_status_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (embedding_status = ANY (ARRAY[''pendente''::text, ''pronto''::text, ''falhou''::text, ''erro''::text]))',
      v_tabela, v_tabela || '_embedding_status_check'
    );
  END LOOP;
END $$;

ALTER TABLE public.admin_ia_base_academica DROP CONSTRAINT IF EXISTS admin_ia_base_academica_embedding_status_check;
ALTER TABLE public.admin_ia_base_academica ADD CONSTRAINT admin_ia_base_academica_embedding_status_check 
  CHECK (embedding_status = ANY (ARRAY['pendente'::text, 'pronto'::text, 'falhou'::text]));
;

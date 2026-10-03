-- Mig 19: REVERTER Mig 18 — voltar CHECK pra duplo EN+PT temporariamente
-- Motivo: edges em prod ainda não foram deployadas com escritas PT (gerar-embedding deployado, demais não).
-- Quando todas edges estiverem deployadas E Semgrep verde no CI, próxima sessão re-aplica Mig 18 (PT-only).

-- 1. Reverter status (5 tabelas COM CHECK duplo + 5 que ganharam CHECK PT-only)
ALTER TABLE public.assinaturas_usuario DROP CONSTRAINT IF EXISTS assinaturas_usuario_status_check;
ALTER TABLE public.assinaturas_usuario ADD CONSTRAINT assinaturas_usuario_status_check 
  CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text, 'suspended'::text, 'ativa'::text, 'expirada'::text, 'cancelada'::text, 'suspensa'::text]));

ALTER TABLE public.caixa_saida_mensagens DROP CONSTRAINT IF EXISTS caixa_saida_mensagens_status_check;
ALTER TABLE public.caixa_saida_mensagens ADD CONSTRAINT caixa_saida_mensagens_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'superseded'::text, 'pendente'::text, 'processando'::text, 'enviada'::text, 'falhou'::text, 'substituida'::text]));

ALTER TABLE public.campanhas DROP CONSTRAINT IF EXISTS campanhas_status_check;
ALTER TABLE public.campanhas ADD CONSTRAINT campanhas_status_check 
  CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'finished'::text, 'rascunho'::text, 'ativa'::text, 'pausada'::text, 'finalizada'::text]));

ALTER TABLE public.candidatos_tag DROP CONSTRAINT IF EXISTS candidatos_tag_status_check;
ALTER TABLE public.candidatos_tag ADD CONSTRAINT candidatos_tag_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'promoted'::text, 'pendente'::text, 'aprovado'::text, 'rejeitado'::text, 'promovido'::text]));

ALTER TABLE public.sugestoes_fusao_tag DROP CONSTRAINT IF EXISTS sugestoes_fusao_tag_status_check;
ALTER TABLE public.sugestoes_fusao_tag ADD CONSTRAINT sugestoes_fusao_tag_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'pendente'::text, 'aprovado'::text, 'rejeitado'::text]));

-- 5 tabelas que receberam CHECK PT-only — voltar pra duplo
ALTER TABLE public.conversas DROP CONSTRAINT IF EXISTS conversas_status_check;
ALTER TABLE public.conversas ADD CONSTRAINT conversas_status_check 
  CHECK (status = ANY (ARRAY['active','human','closed','campaign','ativa','humano','encerrada']));

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_status_check;
ALTER TABLE public.contratos ADD CONSTRAINT contratos_status_check 
  CHECK (status = ANY (ARRAY['pending','awaiting_validation','signed','rejected','pendente','aguardando_validacao','assinado','rejeitado']));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_temperature_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_lead_temperature_check 
  CHECK (lead_temperature IS NULL OR lead_temperature = ANY (ARRAY['cold','warm','hot','frio','morno','quente']));

ALTER TABLE public.acoes_agendadas DROP CONSTRAINT IF EXISTS acoes_agendadas_status_check;
ALTER TABLE public.acoes_agendadas ADD CONSTRAINT acoes_agendadas_status_check 
  CHECK (status = ANY (ARRAY['pending','cancelled','executed','failed','processing','pendente','cancelado','executado','falhou','processando']));

ALTER TABLE public.logs_requisicao_llm DROP CONSTRAINT IF EXISTS logs_requisicao_llm_status_check;
ALTER TABLE public.logs_requisicao_llm ADD CONSTRAINT logs_requisicao_llm_status_check 
  CHECK (status = ANY (ARRAY['success','error','sucesso','erro']));

-- 2. Reverter embedding_status (23 tabelas) pra duplo
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
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (embedding_status = ANY (ARRAY[''pending'',''processing'',''ready'',''failed'',''pendente'',''processando'',''pronto'',''falhou'']))',
      v_tabela, v_tabela || '_embedding_status_check'
    );
  END LOOP;
  FOREACH v_tabela IN ARRAY v_t_3a LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tabela, v_tabela || '_embedding_status_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (embedding_status = ANY (ARRAY[''pending'',''ready'',''error'',''pendente'',''pronto'',''erro'']))',
      v_tabela, v_tabela || '_embedding_status_check'
    );
  END LOOP;
  FOREACH v_tabela IN ARRAY v_t_4b LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tabela, v_tabela || '_embedding_status_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (embedding_status = ANY (ARRAY[''pending'',''ready'',''failed'',''error'',''pendente'',''pronto'',''falhou'',''erro'']))',
      v_tabela, v_tabela || '_embedding_status_check'
    );
  END LOOP;
END $$;

ALTER TABLE public.admin_ia_base_academica DROP CONSTRAINT IF EXISTS admin_ia_base_academica_embedding_status_check;
ALTER TABLE public.admin_ia_base_academica ADD CONSTRAINT admin_ia_base_academica_embedding_status_check 
  CHECK (embedding_status = ANY (ARRAY['pending','ready','failed','pendente','pronto','falhou']));
;

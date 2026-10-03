
-- FASE 0: Remover colunas mortas e tabelas vazias
-- ZONAS BLINDADAS: multinivel_comissoes, configuracao_pagamento, auth.*, planos, pagamentos, api_usage_logs — INTOCADOS

-- 1. agent_templates: dropar colunas JSONB legadas
ALTER TABLE public.agent_templates
  DROP COLUMN IF EXISTS empresa,
  DROP COLUMN IF EXISTS produtos,
  DROP COLUMN IF EXISTS conhecimento,
  DROP COLUMN IF EXISTS guardrails,
  DROP COLUMN IF EXISTS followup,
  DROP COLUMN IF EXISTS contrato,
  DROP COLUMN IF EXISTS nome,
  DROP COLUMN IF EXISTS descricao,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS slug;

-- 2. user_agents: dropar colunas mortas
ALTER TABLE public.user_agents
  DROP COLUMN IF EXISTS razao_social,
  DROP COLUMN IF EXISTS cnpj,
  DROP COLUMN IF EXISTS pix,
  DROP COLUMN IF EXISTS anos_empresa,
  DROP COLUMN IF EXISTS source_template_id,
  DROP COLUMN IF EXISTS auto_archive_days,
  DROP COLUMN IF EXISTS client_flow_stages,
  DROP COLUMN IF EXISTS client_service_flows;

-- 3. lead_cards: dropar colunas mortas
ALTER TABLE public.lead_cards
  DROP COLUMN IF EXISTS regras_completas,
  DROP COLUMN IF EXISTS regras_pendentes,
  DROP COLUMN IF EXISTS ultima_acao,
  DROP COLUMN IF EXISTS humanizacao_usada,
  DROP COLUMN IF EXISTS media_enviada,
  DROP COLUMN IF EXISTS objecoes_tratadas,
  DROP COLUMN IF EXISTS follow_ups_enviados,
  DROP COLUMN IF EXISTS fase_inicio_ciclo;

-- 4. Dropar tabelas vazias (NÃO client_documents — usada ativamente)
DROP TABLE IF EXISTS public.webhook_dedup;
DROP TABLE IF EXISTS public.executed_actions;

-- 5. Dropar função morta associada ao webhook_dedup
DROP FUNCTION IF EXISTS public.cleanup_old_dedup();

;

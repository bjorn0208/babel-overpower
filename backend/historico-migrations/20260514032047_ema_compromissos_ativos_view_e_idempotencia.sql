-- Onda 2 EMA (Companion 12 cravado 12-05-2026) — Plataforma Limpa Ragentic
-- View unifica fontes de compromissos pendentes do agente com o lead.
-- Motor injeta bloco <compromissos_ativos_do_lead> condicional no system prompt.
-- Resolve sintoma: agente cria 4 retornos pra mesma quinta, "boa tarde" repetido em retomadas.

-- 1. VIEW compromissos_ativos (security_invoker herda RLS das tabelas-fonte)
CREATE OR REPLACE VIEW public.compromissos_ativos
WITH (security_invoker = true)
AS
SELECT
  aa.id,
  'retorno'::text                                       AS tipo,
  'iniciativa_do_agente'::text                          AS origem,
  'acoes_agendadas'::text                               AS origem_tabela,
  aa.conversation_id                                    AS conversa_id,
  aa.tenant_id,
  aa.lead_id,
  aa.agente_id,
  COALESCE(aa.carga->>'titulo', aa.action_type)         AS titulo,
  aa.scheduled_at                                       AS executar_em,
  aa.carga,
  aa.status,
  aa.created_at
FROM public.acoes_agendadas aa
WHERE aa.status = 'pendente'
  AND aa.action_type IN (
    'agendamento_retorno', 'agendar_retorno',
    'retomada_planejada', 'agendar_compromisso',
    'agendar_callback', 'cobranca_pagamento', 'cobranca_assinatura'
  )

UNION ALL

SELECT
  cdl.id,
  'reuniao'::text                                       AS tipo,
  'promessa_explicita'::text                            AS origem,
  'compromissos_do_lead'::text                          AS origem_tabela,
  cdl.conversa_id,
  c.tenant_id,
  c.lead_id,
  c.agente_id,
  cdl.titulo,
  cdl.quando                                            AS executar_em,
  cdl.carga,
  cdl.status,
  cdl.criado_em                                         AS created_at
FROM public.compromissos_do_lead cdl
JOIN public.conversas c ON c.id = cdl.conversa_id
WHERE cdl.status = 'agendado'

UNION ALL

SELECT
  ct.id,
  'contrato'::text                                      AS tipo,
  'promessa_explicita'::text                            AS origem,
  'contratos'::text                                     AS origem_tabela,
  ct.conversa_id,
  ct.tenant_id,
  ct.lead_id,
  ct.agente_id,
  COALESCE(ct.titulo, 'Contrato pendente')              AS titulo,
  ct.created_at                                         AS executar_em,
  jsonb_build_object('chave_publica', ct.chave_publica) AS carga,
  ct.status,
  ct.created_at
FROM public.contratos ct
WHERE ct.status IN ('emitido', 'enviado', 'assinado_pendente_pagto');

COMMENT ON VIEW public.compromissos_ativos IS
'EMA (Estado do Mundo do Agente). Unifica compromissos pendentes de 3 origens — acoes_agendadas, compromissos_do_lead, contratos. Consumida pelo motor ragentic-processar-inline antes da síntese para injetar bloco <compromissos_ativos_do_lead> no system prompt e impedir re-promessa/re-saudação. Companion (12), 2026-05-12.';

-- 2. UNIQUE INDEX de idempotência por request_id em acoes_agendadas
-- Garante que duplo-clique/race condition paralelo NÃO crie 2 ações com mesmo request_id.
-- Tool gerenciar_compromisso (a seedar) passa request_id no carga jsonb.
CREATE UNIQUE INDEX IF NOT EXISTS acoes_idempotencia_request_id
ON public.acoes_agendadas ((carga->>'request_id'))
WHERE carga->>'request_id' IS NOT NULL;
;

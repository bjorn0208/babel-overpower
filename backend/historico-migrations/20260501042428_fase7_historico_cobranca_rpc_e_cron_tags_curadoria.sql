CREATE OR REPLACE FUNCTION public.historico_cobranca_lead(p_lead_id uuid)
RETURNS TABLE(
  tipo text,
  data timestamptz,
  valor numeric,
  status text,
  campaign_id uuid,
  campaign_name text,
  meta jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    'pagamento'::text,
    COALESCE(cp.data_pagamento, cp.created_at),
    cp.valor,
    cp.status,
    NULL::uuid,
    NULL::text,
    jsonb_build_object('payment_id', cp.id, 'metodo', cp.metodo_pagamento, 'data_vencimento', cp.data_vencimento, 'descricao', cp.descricao)
  FROM public.client_payments cp
  WHERE cp.lead_id = p_lead_id

  UNION ALL

  SELECT
    'campanha_cobranca'::text,
    cl.entered_at,
    NULL::numeric,
    cl.state,
    c.id,
    c.name,
    jsonb_build_object('campaign_lead_id', cl.id, 'phase', cl.phase, 'attempt_count', cl.attempt_count, 'exit_reason', cl.exit_reason)
  FROM public.campaign_leads cl
  JOIN public.campaigns c ON c.id = cl.campaign_id
  WHERE cl.lead_id = p_lead_id
    AND c.type = 'cobranca'
    AND c.deleted_at IS NULL

  ORDER BY 2 DESC NULLS LAST;
$$;

INSERT INTO public.cronjobs_config (nome, descricao, categoria, modo, cron_expr, edge_function, ativo, motivo_criacao)
VALUES (
  'cron-tags-curadoria',
  'Roda clusterização de tags candidatas, gera sugestões de merge e backfill de aliases canônicos.',
  'curadoria',
  'horario',
  '0 5 * * 3',
  'cron-tags-curadoria',
  true,
  'Fase 7 do PLANO-UNIFICADO — registrar cron já existente como edge function no painel pra admin operar.'
)
ON CONFLICT DO NOTHING;

;

-- A7 (Trilha A): linha do tempo do contato — ações DATADAS (contrato emitido/assinado/pago,
-- compromissos, agendamentos) num único UNION = 1 conexão. Injetada no prompt do motor just-in-time.
CREATE OR REPLACE FUNCTION public.linha_do_tempo_contato(
  p_lead_id uuid,
  p_tenant_id uuid,
  p_limite int DEFAULT 12
)
RETURNS TABLE (quando timestamptz, tipo text, descricao text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eventos AS (
    -- contrato emitido
    SELECT c.created_at AS quando, 'contrato'::text AS tipo,
           ('contrato "' || coalesce(nullif(c.titulo,''),'sem título') || '" emitido'
            || CASE WHEN c.status IS NOT NULL THEN ' (status: ' || c.status || ')' ELSE '' END) AS descricao
    FROM public.contratos c
    WHERE c.lead_id = p_lead_id AND c.tenant_id = p_tenant_id
    UNION ALL
    -- contrato assinado
    SELECT c.assinado_em, 'contrato_assinado'::text,
           ('contrato "' || coalesce(nullif(c.titulo,''),'sem título') || '" ASSINADO pelo cliente')
    FROM public.contratos c
    WHERE c.lead_id = p_lead_id AND c.tenant_id = p_tenant_id AND c.assinado_em IS NOT NULL
    UNION ALL
    -- pagamento recebido (comprovante anexado ao contrato)
    SELECT c.created_at, 'pagamento'::text,
           ('pagamento recebido'
            || CASE WHEN c.metodo_pagamento IS NOT NULL THEN ' via ' || c.metodo_pagamento ELSE '' END
            || ' (comprovante anexado)')
    FROM public.contratos c
    WHERE c.lead_id = p_lead_id AND c.tenant_id = p_tenant_id AND c.url_comprovante_pagamento IS NOT NULL
    UNION ALL
    -- compromissos ativos (promessas/follow-ups com data)
    SELECT coalesce(ca.executar_em, ca.created_at), 'compromisso'::text,
           (coalesce(nullif(ca.titulo,''), ca.tipo, 'compromisso')
            || CASE WHEN ca.status IS NOT NULL THEN ' (' || ca.status || ')' ELSE '' END)
    FROM public.compromissos_ativos ca
    WHERE ca.lead_id = p_lead_id AND ca.tenant_id = p_tenant_id
    UNION ALL
    -- ações agendadas (callbacks)
    SELECT coalesce(aa.executed_at, aa.scheduled_at), 'agendamento'::text,
           (coalesce(aa.action_type, 'ação') || ' agendada'
            || CASE WHEN aa.status IS NOT NULL THEN ' (' || aa.status || ')' ELSE '' END)
    FROM public.acoes_agendadas aa
    WHERE aa.lead_id = p_lead_id AND aa.tenant_id = p_tenant_id
  )
  SELECT quando, tipo, descricao FROM (
    SELECT quando, tipo, descricao FROM eventos WHERE quando IS NOT NULL ORDER BY quando DESC LIMIT p_limite
  ) sub
  ORDER BY quando ASC;
$$;

REVOKE ALL ON FUNCTION public.linha_do_tempo_contato(uuid, uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.linha_do_tempo_contato(uuid, uuid, int) TO authenticated, service_role;
;

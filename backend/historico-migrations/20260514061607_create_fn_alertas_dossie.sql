-- B3: RPC alertas do dossiê — retorna risks coloridos por severity
-- Cria 4 alertas: pagamento pendente, contrato pendente assinatura, compromisso vencido, lead frio

CREATE OR REPLACE FUNCTION public.fn_alertas_dossie(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE alertas jsonb := '[]'::jsonb;
BEGIN
  -- Pagamento pendente (via cliente)
  IF EXISTS (
    SELECT 1 FROM public.pagamentos p
    JOIN public.clientes c ON c.id = p.cliente_id
    WHERE p.status = 'pendente'
  ) THEN
    alertas := alertas || jsonb_build_object(
      'tipo', 'pagamento_pendente',
      'severity', 'amarelo',
      'msg', 'Pagamento pendente associado a este lead'
    );
  END IF;

  -- Contrato sem assinatura há mais de 7 dias
  IF EXISTS (
    SELECT 1 FROM public.contratos
    WHERE lead_id = p_lead_id
      AND assinado_em IS NULL
      AND created_at < now() - interval '7 days'
  ) THEN
    alertas := alertas || jsonb_build_object(
      'tipo', 'contrato_pendente_assinatura',
      'severity', 'amarelo',
      'msg', 'Contrato sem assinatura há mais de 7 dias'
    );
  END IF;

  -- Compromisso vencido sem ação
  IF EXISTS (
    SELECT 1 FROM public.compromissos_ativos ca
    WHERE ca.conversa_id IN (SELECT id FROM public.conversas WHERE lead_id = p_lead_id)
      AND ca.executar_em < now()
      AND ca.status IN ('pendente', 'agendado')
  ) THEN
    alertas := alertas || jsonb_build_object(
      'tipo', 'compromisso_vencido',
      'severity', 'vermelho',
      'msg', 'Compromisso vencido sem ação'
    );
  END IF;

  -- Lead frio: última mensagem do lead há mais de 3 dias
  IF EXISTS (
    SELECT 1 FROM public.mensagens m
    JOIN public.conversas c ON c.id = m.conversation_id
    WHERE c.lead_id = p_lead_id
      AND m.role = 'user'
      AND m.deleted_at IS NULL
    GROUP BY c.lead_id
    HAVING MAX(m.created_at) < now() - interval '3 days'
       AND MAX(m.created_at) > now() - interval '30 days'
  ) THEN
    alertas := alertas || jsonb_build_object(
      'tipo', 'lead_frio',
      'severity', 'amarelo',
      'msg', 'Lead silencioso há mais de 3 dias — talvez retomar'
    );
  END IF;

  RETURN alertas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_alertas_dossie(uuid) TO authenticated;
;

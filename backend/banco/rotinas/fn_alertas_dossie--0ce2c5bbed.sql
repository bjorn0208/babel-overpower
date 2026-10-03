CREATE OR REPLACE FUNCTION public.fn_alertas_dossie(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE alertas jsonb := '[]'::jsonb;
BEGIN
  -- Guard de posse: sem isto, qualquer usuário logado lia o lead de outro tenant
  -- passando o id alheio (raio-x 2026-09-04, P1 "residual cross-tenant entre logados").
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'sem permissão para este lead' USING ERRCODE = '42501';
  END IF;

  -- Pagamento pendente DESTE lead.
  -- Antes: SELECT em public.pagamentos (tabela morta, 0 linhas) sem NENHUMA referência a
  -- p_lead_id — o alerta nunca acendia, e o EXISTS era global a todos os tenants.
  -- Agora: public.pagamentos_cliente, que tem lead_id/tenant_id de verdade.
  -- CORTE POR DATA (decisão do dono, 2026-09-08): só pagamentos criados a partir da
  -- virada deste fix contam. Sem o corte, os 464 pendentes já existentes acenderiam
  -- alerta de uma vez em leads antigos, muitos deles já errados ou já notificados.
  IF EXISTS (
    SELECT 1 FROM public.pagamentos_cliente pc
    WHERE pc.lead_id = p_lead_id
      AND pc.status = 'pendente'
      AND pc.created_at >= TIMESTAMPTZ '2026-09-08 18:30:00-03'
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
$function$


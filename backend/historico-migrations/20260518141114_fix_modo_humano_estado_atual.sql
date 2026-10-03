-- v3 (2026-05-18): "modo humano" pelo ESTADO ATUAL da conversa, não pelo
-- histórico. v2 usava EXISTS msg role='human' → marcava conversa_humana
-- até em conversa que teve humano 1x mas voltou pro modo IA (bug do lead
-- 558592426208: status=ativa, agent_enabled=true = IA, mas vinha humano).
-- Estado atual real = status='humano' OU agent_enabled=false (IA desligada).
CREATE OR REPLACE FUNCTION public.fn_notificar_msg_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_resp uuid;
  v_lead uuid;
  v_status text;
  v_agent_on boolean;
  v_precisa_humano boolean;
  v_dest uuid;
  v_tipo text;
  v_titulo text;
  v_trecho text;
BEGIN
  IF NEW.role <> 'user' THEN
    RETURN NEW;
  END IF;

  SELECT c.tenant_id, c.responsavel_id, c.lead_id, c.status, c.agent_enabled
    INTO v_tenant, v_resp, v_lead, v_status, v_agent_on
  FROM public.conversas c
  WHERE c.id = NEW.conversation_id;

  IF v_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.precisa_humano INTO v_precisa_humano
  FROM public.leads l
  WHERE l.id = v_lead;

  IF v_precisa_humano IS TRUE THEN
    v_tipo := 'handoff';
    v_titulo := 'Lead pediu atendimento humano';
  ELSIF v_status = 'humano' OR v_agent_on IS FALSE THEN
    -- humano atendendo AGORA (IA desligada nesta conversa)
    v_tipo := 'conversa_humana';
    v_titulo := 'Mensagem em atendimento humano';
  ELSE
    v_tipo := 'conversa_mensagem';
    v_titulo := 'Nova mensagem do contato';
  END IF;

  v_dest := coalesce(v_resp, v_tenant);
  v_trecho := left(coalesce(NEW.content, ''), 120);

  INSERT INTO public.notificacoes
    (user_id, tipo, icone, titulo, mensagem, acao, acao_label, lida)
  VALUES
    (v_dest, v_tipo, 'whatsapp', v_titulo, v_trecho, 'conversas', 'Abrir conversa', false);

  RETURN NEW;
END;
$$;
;

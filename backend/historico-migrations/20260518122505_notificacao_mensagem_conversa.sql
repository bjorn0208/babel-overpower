-- Produtor de notificações do app Conversas.
-- Gatilho: mensagem do contato (role='user') inserida em public.mensagens.
-- Destino conforme atribuição/modo (decisão Theus 2026-05-18):
--   responsavel_id setado        -> notifica o responsável
--   sem responsável + handoff    -> notifica o dono (tenant_id)
--   sem responsável + status humano -> notifica o dono (tenant_id)
--   modo IA, sem resp, sem handoff  -> não notifica (o agente cuida)
-- SECURITY DEFINER pois RLS de notificacoes só permite INSERT a admin.
CREATE OR REPLACE FUNCTION public.fn_notificar_msg_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_resp uuid;
  v_status text;
  v_lead uuid;
  v_precisa_humano boolean;
  v_dest uuid;
  v_tipo text;
  v_titulo text;
  v_trecho text;
BEGIN
  -- early-return: só mensagem do contato/lead vira notificação
  -- (custo ~zero para as msgs de 'assistant'/'system'/'human', que são a maioria)
  IF NEW.role <> 'user' THEN
    RETURN NEW;
  END IF;

  SELECT c.tenant_id, c.responsavel_id, c.status, c.lead_id
    INTO v_tenant, v_resp, v_status, v_lead
  FROM public.conversas c
  WHERE c.id = NEW.conversation_id;

  IF v_tenant IS NULL THEN
    RETURN NEW;  -- conversa órfã: nada a notificar
  END IF;

  SELECT l.precisa_humano INTO v_precisa_humano
  FROM public.leads l
  WHERE l.id = v_lead;

  IF v_resp IS NOT NULL THEN
    v_dest := v_resp;
    v_tipo := 'conversa_atribuida';
    v_titulo := 'Nova mensagem do seu contato';
  ELSIF v_precisa_humano IS TRUE THEN
    v_dest := v_tenant;
    v_tipo := 'handoff';
    v_titulo := 'Lead pediu atendimento humano';
  ELSIF v_status = 'humano' THEN
    v_dest := v_tenant;
    v_tipo := 'conversa_humana';
    v_titulo := 'Mensagem em atendimento humano';
  ELSE
    RETURN NEW;  -- modo IA sem responsável e sem handoff: o agente cuida
  END IF;

  v_trecho := left(coalesce(NEW.content, ''), 120);

  INSERT INTO public.notificacoes
    (user_id, tipo, icone, titulo, mensagem, acao, acao_label, lida)
  VALUES
    (v_dest, v_tipo, 'whatsapp', v_titulo, v_trecho, 'conversas', 'Abrir conversa', false);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_msg_conversa ON public.mensagens;
CREATE TRIGGER trg_notificar_msg_conversa
AFTER INSERT ON public.mensagens
FOR EACH ROW
EXECUTE FUNCTION public.fn_notificar_msg_conversa();
;

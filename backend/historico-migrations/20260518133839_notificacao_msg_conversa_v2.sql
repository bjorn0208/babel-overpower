-- v2 (2026-05-18): regra "sempre notifica, modo humano prioritário" (decisão Theus).
-- Toda msg do contato (role='user') gera notificação pro responsável (se houver)
-- senão pro dono (tenant_id). Tipo por prioridade:
--   precisa_humano        -> 'handoff'           (mais urgente)
--   conversa teve human   -> 'conversa_humana'   (humano no circuito)
--   senão                 -> 'conversa_mensagem' (modo IA normal)
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
  v_precisa_humano boolean;
  v_teve_humano boolean;
  v_dest uuid;
  v_tipo text;
  v_titulo text;
  v_trecho text;
BEGIN
  -- só mensagem do contato/lead vira notificação (early-return barra
  -- assistant/system/human — a maioria das inserts)
  IF NEW.role <> 'user' THEN
    RETURN NEW;
  END IF;

  SELECT c.tenant_id, c.responsavel_id, c.lead_id
    INTO v_tenant, v_resp, v_lead
  FROM public.conversas c
  WHERE c.id = NEW.conversation_id;

  IF v_tenant IS NULL THEN
    RETURN NEW;  -- conversa órfã
  END IF;

  SELECT l.precisa_humano INTO v_precisa_humano
  FROM public.leads l
  WHERE l.id = v_lead;

  -- "teve humano" = atendente já respondeu nessa conversa
  -- (idx_messages_conversation_role cobre conversation_id+role)
  v_teve_humano := EXISTS (
    SELECT 1 FROM public.mensagens m2
    WHERE m2.conversation_id = NEW.conversation_id
      AND m2.role = 'human'
  );

  IF v_precisa_humano IS TRUE THEN
    v_tipo := 'handoff';
    v_titulo := 'Lead pediu atendimento humano';
  ELSIF v_teve_humano THEN
    v_tipo := 'conversa_humana';
    v_titulo := 'Mensagem em atendimento humano';
  ELSE
    v_tipo := 'conversa_mensagem';
    v_titulo := 'Nova mensagem do contato';
  END IF;

  -- SEMPRE notifica: responsável se atribuída, senão o dono
  v_dest := coalesce(v_resp, v_tenant);
  v_trecho := left(coalesce(NEW.content, ''), 120);

  INSERT INTO public.notificacoes
    (user_id, tipo, icone, titulo, mensagem, acao, acao_label, lida)
  VALUES
    (v_dest, v_tipo, 'whatsapp', v_titulo, v_trecho, 'conversas', 'Abrir conversa', false);

  RETURN NEW;
END;
$$;

-- realtime: notificacoes precisa estar na publicação senão o front
-- nunca recebe o INSERT ao vivo. Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notificacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
  END IF;
END $$;
;

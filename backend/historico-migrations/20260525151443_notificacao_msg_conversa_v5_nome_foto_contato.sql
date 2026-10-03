-- Notificação de conversa passa a carregar NOME e FOTO do contato.
-- Coluna nova (nullable, sem default) + função v5 que puxa do lead.

ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS foto_url text;

CREATE OR REPLACE FUNCTION public.fn_notificar_msg_conversa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_resp uuid;
  v_lead uuid;
  v_status text;
  v_agent_on boolean;
  v_channel text;
  v_precisa_humano boolean;
  v_dest uuid;
  v_tipo text;
  v_titulo text;
  v_trecho text;
  v_nome text;
  v_foto text;
BEGIN
  IF NEW.role <> 'user' THEN
    RETURN NEW;
  END IF;

  SELECT c.tenant_id, c.responsavel_id, c.lead_id, c.status, c.agent_enabled, c.channel
    INTO v_tenant, v_resp, v_lead, v_status, v_agent_on, v_channel
  FROM public.conversas c
  WHERE c.id = NEW.conversation_id;

  IF v_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  -- Chat-Teste é ambiente isolado: conversas channel='teste' não geram notificação.
  IF v_channel = 'teste' THEN
    RETURN NEW;
  END IF;

  -- v5 (Theus 2026-05-25): puxa nome + foto do contato pra notificação ficar
  -- identificada (foto do WhatsApp + nome no título). O tipo segue carregando o
  -- contexto (handoff/humano/mensagem) — o frontend deriva o selo visual.
  SELECT l.precisa_humano,
         coalesce(
           nullif(btrim(l.nome_exibicao), ''),
           nullif(btrim(l.name), ''),
           nullif(btrim(l.nome_provedor), '')
         ),
         nullif(btrim(l.url_foto_perfil), '')
    INTO v_precisa_humano, v_nome, v_foto
  FROM public.leads l
  WHERE l.id = v_lead;

  IF v_precisa_humano IS TRUE THEN
    v_tipo := 'handoff';
  ELSIF v_status = 'humano' OR v_agent_on IS FALSE THEN
    v_tipo := 'conversa_humana';
  ELSE
    v_tipo := 'conversa_mensagem';
  END IF;

  v_titulo := coalesce(v_nome, 'Novo contato');
  v_dest := coalesce(v_resp, v_tenant);
  v_trecho := left(coalesce(NEW.content, ''), 120);

  INSERT INTO public.notificacoes
    (user_id, tipo, icone, titulo, mensagem, acao, acao_label, lida, foto_url)
  VALUES
    (v_dest, v_tipo, 'whatsapp', v_titulo, v_trecho, 'conversas', 'Abrir conversa', false, v_foto);

  RETURN NEW;
END;
$function$;
;

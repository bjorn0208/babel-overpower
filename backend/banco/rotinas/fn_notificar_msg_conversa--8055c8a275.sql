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
  v_msg text;
  v_nome text;
  v_foto text;
  v_midia_url text;
  v_midia_tipo text;
  v_mtipo_raw text;
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

  -- v5: identidade do contato (nome no título + foto do WhatsApp).
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

  -- v6: mídia da mensagem. Quando há anexo, a notificação carrega a URL + tipo
  -- normalizado e usa a transcrição/legenda como texto (não o placeholder
  -- [MEDIA_RECEBIDA]). Texto comum segue como trecho de 120 chars.
  IF NEW.carga ? 'media_url' THEN
    v_midia_url := nullif(btrim(NEW.carga->>'media_url'), '');
    v_mtipo_raw := lower(coalesce(NEW.carga->>'media_type', ''));
    v_midia_tipo := CASE
      WHEN v_mtipo_raw LIKE 'image%' THEN 'image'
      WHEN v_mtipo_raw LIKE 'audio%' THEN 'audio'
      WHEN v_mtipo_raw LIKE 'video%' THEN 'video'
      ELSE 'document'
    END;
    v_msg := nullif(btrim(NEW.carga->>'media_descricao'), '');
  ELSE
    v_midia_url := NULL;
    v_midia_tipo := NULL;
    v_msg := left(coalesce(NEW.content, ''), 120);
  END IF;

  INSERT INTO public.notificacoes
    (user_id, tipo, icone, titulo, mensagem, acao, acao_label, lida, foto_url, midia_url, midia_tipo)
  VALUES
    (v_dest, v_tipo, 'whatsapp', v_titulo, v_msg, 'conversas', 'Abrir conversa', false, v_foto, v_midia_url, v_midia_tipo);

  RETURN NEW;
END;
$function$


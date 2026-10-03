CREATE OR REPLACE FUNCTION public.varrer_buffers_orfaos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_buf record; v_conv uuid; v_texto text; v_media_url text; v_media_type text;
  v_disparados integer := 0; v_url text; v_key text; v_claim jsonb;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'edge_functions_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  FOR v_buf IN
    SELECT b.* FROM public.buffer_mensagens b
    WHERE b.processed = false AND b.is_composing = false
      AND b.last_activity_at < now() - interval '45 seconds'
    LIMIT 10
  LOOP
    -- conversa correspondente (tenant = dono do agente)
    SELECT c.id INTO v_conv
      FROM public.conversas c
      JOIN public.agentes_usuario a ON a.id = v_buf.agente_id
     WHERE c.phone = v_buf.phone AND c.tenant_id = a.user_id
     ORDER BY c.created_at DESC LIMIT 1;

    -- trava: se conversa existe e está travada (execução viva), pula; senão adquire.
    IF v_conv IS NOT NULL AND NOT public.adquirir_trava_motor(v_conv, 180) THEN
      CONTINUE;
    END IF;

    -- claim atômico
    SELECT public.reivindicar_buffer_mensagem(v_buf.phone, v_buf.agente_id) INTO v_claim;
    IF COALESCE((v_claim->>'count')::int, 0) = 0 THEN
      IF v_conv IS NOT NULL THEN PERFORM public.liberar_trava_motor(v_conv); END IF;
      CONTINUE;
    END IF;

    SELECT string_agg(m->>'text', E'\n' ORDER BY m->>'received_at'),
           (array_agg(m->>'media_url') FILTER (WHERE m->>'media_url' IS NOT NULL))[1],
           (array_agg(m->>'media_type') FILTER (WHERE m->>'media_type' IS NOT NULL))[1]
      INTO v_texto, v_media_url, v_media_type
      FROM jsonb_array_elements(v_claim->'mensagens') m;

    PERFORM net.http_post(
      url := v_url || '/ragentic-processar-inline',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
      body := jsonb_build_object(
        'message', COALESCE(v_texto,'[MEDIA_RECEBIDA]'),
        'agente_id', v_buf.agente_id,
        'phone', v_buf.phone,
        'media_url', v_media_url,
        'media_type', v_media_type,
        'channel', 'whatsapp',
        'source', 'webhook',
        'inbound_persistida', true,
        'corte_em', now()::text
      ) || CASE WHEN v_conv IS NOT NULL THEN jsonb_build_object('conversation_id', v_conv) ELSE '{}'::jsonb END
    );
    v_disparados := v_disparados + 1;
  END LOOP;
  RETURN v_disparados;
END;
$function$


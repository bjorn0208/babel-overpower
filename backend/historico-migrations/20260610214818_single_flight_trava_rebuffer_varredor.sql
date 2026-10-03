-- Single-flight por conversa (caso Dantas 2026-06-10): rajada de msgs do lead vira 1 execução do motor.
-- Peças: trava com TTL (reusa tabela órfã travas_conversa), rebufferar (execução obsoleta devolve
-- a carga pro buffer), varredor anti-silêncio (pg_cron 1/min resgata buffer órfão).

-- 1) Adquirir trava do motor (TTL). true = pode executar; false = já tem execução viva.
CREATE OR REPLACE FUNCTION public.adquirir_trava_motor(p_conversation_id uuid, p_ttl_segundos integer DEFAULT 180)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_linhas integer;
BEGIN
  INSERT INTO public.travas_conversa (conversation_id, locked_at, expires_at)
  VALUES (p_conversation_id, now(), now() + make_interval(secs => p_ttl_segundos))
  ON CONFLICT (conversation_id) DO UPDATE
    SET locked_at = now(), expires_at = now() + make_interval(secs => p_ttl_segundos)
    WHERE public.travas_conversa.expires_at < now();
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas > 0;
END;
$$;

-- 2) Liberar trava (idempotente).
CREATE OR REPLACE FUNCTION public.liberar_trava_motor(p_conversation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.travas_conversa WHERE conversation_id = p_conversation_id;
$$;

-- 3) Rebufferar: execução obsoleta devolve sua carga (texto combinado + mídia) pro buffer aberto
--    (PREPEND, ordem cronológica) ou recria linha processed=false. channel_id resolvido da última
--    linha de buffer do par phone+agente (sempre existe — a própria msg claimada criou).
CREATE OR REPLACE FUNCTION public.rebufferar_mensagens(
  p_phone text, p_agent_id uuid, p_texto text,
  p_media_url text DEFAULT NULL, p_media_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_aberto record; v_channel uuid; v_msg jsonb;
BEGIN
  v_msg := jsonb_build_object('text', COALESCE(p_texto,''), 'media_url', p_media_url,
                              'media_type', p_media_type, 'received_at', now());
  SELECT * INTO v_aberto FROM public.buffer_mensagens
   WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false
   FOR UPDATE;
  IF v_aberto IS NOT NULL THEN
    UPDATE public.buffer_mensagens
       SET mensagens = jsonb_build_array(v_msg) || mensagens,
           first_at = LEAST(first_at, now())
     WHERE id = v_aberto.id;
  ELSE
    SELECT channel_id INTO v_channel FROM public.buffer_mensagens
     WHERE phone = p_phone AND agente_id = p_agent_id
     ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.buffer_mensagens (phone, agente_id, channel_id, mensagens, is_composing, first_at, last_activity_at, processed)
    VALUES (p_phone, p_agent_id, v_channel, jsonb_build_array(v_msg), false, now(), now(), false);
  END IF;
END;
$$;

-- 4) Varredor anti-silêncio: buffer parado >45s, sem digitação e sem trava ativa → claim + chama o motor.
--    Cobre execução >90s (webhook desistiu do poll) e qualquer rebuffer órfão. Roda via pg_cron 1/min.
CREATE OR REPLACE FUNCTION public.varrer_buffers_orfaos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- 5) Cron 1/min (idempotente).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'varrer_buffers_orfaos_min') THEN
    PERFORM cron.unschedule('varrer_buffers_orfaos_min');
  END IF;
  PERFORM cron.schedule('varrer_buffers_orfaos_min', '* * * * *', $cron$SELECT public.varrer_buffers_orfaos();$cron$);
END $$;
;

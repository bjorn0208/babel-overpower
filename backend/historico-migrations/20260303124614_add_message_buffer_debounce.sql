
-- Tabela message_buffer para debounce de mensagens do lead
CREATE TABLE IF NOT EXISTS public.message_buffer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  agent_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_composing boolean NOT NULL DEFAULT false,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index para buffer ativo (1 buffer por phone+agent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_buffer_active
  ON public.message_buffer (phone, agent_id) WHERE processed = false;

-- Index para cleanup
CREATE INDEX IF NOT EXISTS idx_message_buffer_cleanup
  ON public.message_buffer (processed, created_at) WHERE processed = true;

-- RPC 1: buffer_incoming_message
CREATE OR REPLACE FUNCTION public.buffer_incoming_message(
  p_phone text, p_agent_id uuid, p_channel_id uuid,
  p_text text, p_media_url text DEFAULT NULL, p_media_type text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_existing record; v_msg jsonb;
BEGIN
  v_msg := jsonb_build_object(
    'text', COALESCE(p_text, ''), 'media_url', p_media_url,
    'media_type', p_media_type, 'received_at', now());
  SELECT * INTO v_existing FROM public.message_buffer
  WHERE phone = p_phone AND agent_id = p_agent_id AND processed = false FOR UPDATE;
  IF v_existing IS NULL THEN
    INSERT INTO public.message_buffer (phone, agent_id, channel_id, messages, is_composing, first_at, last_activity_at)
    VALUES (p_phone, p_agent_id, p_channel_id, jsonb_build_array(v_msg), false, now(), now());
    RETURN jsonb_build_object('is_first', true);
  ELSE
    UPDATE public.message_buffer
    SET messages = messages || jsonb_build_array(v_msg), is_composing = false, last_activity_at = now()
    WHERE id = v_existing.id;
    RETURN jsonb_build_object('is_first', false);
  END IF;
END; $$;

-- RPC 2: set_buffer_composing
CREATE OR REPLACE FUNCTION public.set_buffer_composing(
  p_phone text, p_agent_id uuid, p_composing boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_composing THEN
    UPDATE public.message_buffer SET is_composing = true
    WHERE phone = p_phone AND agent_id = p_agent_id AND processed = false;
  ELSE
    UPDATE public.message_buffer SET is_composing = false, last_activity_at = now()
    WHERE phone = p_phone AND agent_id = p_agent_id AND processed = false;
  END IF;
  RETURN jsonb_build_object('updated', FOUND);
END; $$;

-- RPC 3: check_buffer_ready
CREATE OR REPLACE FUNCTION public.check_buffer_ready(
  p_phone text, p_agent_id uuid, p_threshold_seconds int DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_buf record;
BEGIN
  SELECT * INTO v_buf FROM public.message_buffer
  WHERE phone = p_phone AND agent_id = p_agent_id AND processed = false;
  IF v_buf IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'exists', false);
  END IF;
  RETURN jsonb_build_object(
    'ready', (NOT v_buf.is_composing AND (now() - v_buf.last_activity_at) >= make_interval(secs => p_threshold_seconds)),
    'exists', true,
    'is_composing', v_buf.is_composing,
    'age_ms', EXTRACT(EPOCH FROM (now() - v_buf.last_activity_at)) * 1000,
    'count', jsonb_array_length(v_buf.messages));
END; $$;

-- RPC 4: claim_message_buffer
CREATE OR REPLACE FUNCTION public.claim_message_buffer(
  p_phone text, p_agent_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_buffer record;
BEGIN
  UPDATE public.message_buffer SET processed = true
  WHERE phone = p_phone AND agent_id = p_agent_id AND processed = false
  RETURNING * INTO v_buffer;
  IF v_buffer IS NULL THEN
    RETURN jsonb_build_object('messages', '[]'::jsonb, 'count', 0);
  END IF;
  RETURN jsonb_build_object(
    'messages', v_buffer.messages, 'count', jsonb_array_length(v_buffer.messages),
    'first_at', v_buffer.first_at, 'last_at', v_buffer.last_activity_at,
    'channel_id', v_buffer.channel_id);
END; $$;

-- Cron: limpar buffers processados > 1 hora
SELECT cron.schedule('cleanup-message-buffer', '*/30 * * * *',
  $$DELETE FROM public.message_buffer WHERE processed = true AND created_at < now() - interval '1 hour'$$);

;

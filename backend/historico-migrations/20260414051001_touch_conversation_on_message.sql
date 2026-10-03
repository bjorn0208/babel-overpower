-- Touch conversations.updated_at quando uma mensagem é inserida.
-- Isso permite que o canal realtime de 'conversations' dispare no frontend
-- sempre que chega mensagem nova, atualizando preview/ordenação da lista.

CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conversation_on_message ON public.messages;

CREATE TRIGGER trg_touch_conversation_on_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_conversation_on_message();
;

-- Wrappers públicos para pgmq (PostgREST não enxerga schema pgmq diretamente).
CREATE OR REPLACE FUNCTION public.fila_enviar(queue_name text, msg jsonb, delay int DEFAULT 0)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$ SELECT pgmq.send(queue_name, msg, delay); $$;

CREATE OR REPLACE FUNCTION public.fila_ler(queue_name text, vt int DEFAULT 30, qty int DEFAULT 1)
RETURNS SETOF pgmq.message_record
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$ SELECT * FROM pgmq.read(queue_name, vt, qty); $$;

CREATE OR REPLACE FUNCTION public.fila_apagar(queue_name text, msg_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$ SELECT pgmq.delete(queue_name, msg_id); $$;

CREATE OR REPLACE FUNCTION public.fila_arquivar(queue_name text, msg_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$ SELECT pgmq.archive(queue_name, msg_id); $$;

REVOKE EXECUTE ON FUNCTION public.fila_enviar(text, jsonb, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fila_ler(text, int, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fila_apagar(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fila_arquivar(text, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fila_enviar(text, jsonb, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fila_ler(text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fila_apagar(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fila_arquivar(text, bigint) TO service_role;
;

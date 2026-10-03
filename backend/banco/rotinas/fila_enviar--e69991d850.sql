CREATE OR REPLACE FUNCTION public.fila_enviar(queue_name text, msg jsonb, delay integer DEFAULT 0)
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$ SELECT pgmq.send(queue_name, msg, delay); $function$


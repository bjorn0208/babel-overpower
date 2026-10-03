CREATE OR REPLACE FUNCTION public.fila_arquivar(queue_name text, msg_id bigint)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$ SELECT pgmq.archive(queue_name, msg_id); $function$


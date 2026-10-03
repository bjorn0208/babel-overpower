CREATE OR REPLACE FUNCTION public.fila_ler(queue_name text, vt integer DEFAULT 30, qty integer DEFAULT 1)
 RETURNS SETOF pgmq.message_record
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$ SELECT * FROM pgmq.read(queue_name, vt, qty); $function$


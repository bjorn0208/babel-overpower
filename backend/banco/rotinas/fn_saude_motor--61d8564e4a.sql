CREATE OR REPLACE FUNCTION public.fn_saude_motor()
 RETURNS TABLE(fila text, pendentes bigint, ultimo_evento timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    q.queue_name::text,
    coalesce(m.queue_length, 0)::bigint,
    m.newest_msg_age_sec::timestamptz
  FROM pgmq.list_queues() q
  LEFT JOIN LATERAL (SELECT * FROM pgmq.metrics(q.queue_name)) m ON true
  WHERE q.queue_name LIKE 'fila_%';
EXCEPTION WHEN OTHERS THEN RETURN;
END;
$function$


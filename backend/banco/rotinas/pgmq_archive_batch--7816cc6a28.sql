CREATE OR REPLACE FUNCTION public.pgmq_archive_batch(p_queue text, p_msg_ids bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pgmq'
AS $function$
BEGIN
  PERFORM pgmq.archive(p_queue, m_id) FROM unnest(p_msg_ids) AS m_id;
END;
$function$


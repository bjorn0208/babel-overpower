CREATE OR REPLACE FUNCTION public.processar_tarefas_vetor_semantico(p_batch integer DEFAULT 10)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  msg record;
  v_url text;
  v_key text;
  v_processed int := 0;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'EMBED_FUNCTION_URL' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN 0;
  END IF;

  FOR msg IN SELECT * FROM pgmq.read('embedding_jobs', 60, p_batch) LOOP
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := msg.message
    );
    PERFORM pgmq.delete('embedding_jobs', msg.msg_id);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$function$


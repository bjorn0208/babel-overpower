CREATE OR REPLACE FUNCTION public.verificar_dedup_webhook(p_zapi_message_id text DEFAULT NULL::text, p_hash text DEFAULT NULL::text, p_window_seconds integer DEFAULT 15)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_is_dup boolean := false;
  v_hash_int bigint;
BEGIN
  IF p_zapi_message_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.dedup_webhook WHERE zapi_message_id = p_zapi_message_id
    ) INTO v_is_dup;
    IF v_is_dup THEN
      RETURN true;
    END IF;

    INSERT INTO public.dedup_webhook (message_hash, zapi_message_id, received_at)
      VALUES (COALESCE(p_hash, p_zapi_message_id), p_zapi_message_id, now())
      ON CONFLICT (message_hash) DO UPDATE
        SET zapi_message_id = EXCLUDED.zapi_message_id,
            received_at = now();
    RETURN false;
  END IF;

  IF p_hash IS NULL THEN
    RETURN false;
  END IF;

  v_hash_int := ('x' || left(p_hash, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_hash_int);

  SELECT EXISTS(
    SELECT 1 FROM public.dedup_webhook
    WHERE message_hash = p_hash
      AND received_at > now() - (p_window_seconds || ' seconds')::interval
  ) INTO v_is_dup;

  IF v_is_dup THEN
    RETURN true;
  END IF;

  INSERT INTO public.dedup_webhook (message_hash, received_at)
    VALUES (p_hash, now())
    ON CONFLICT (message_hash) DO UPDATE SET received_at = now();
  RETURN false;
END;
$function$


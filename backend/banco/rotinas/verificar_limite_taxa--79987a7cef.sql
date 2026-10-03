CREATE OR REPLACE FUNCTION public.verificar_limite_taxa(p_identifier text, p_endpoint text, p_max_requests integer DEFAULT 30, p_window_seconds integer DEFAULT 60)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO limites_taxa (identifier, endpoint) VALUES (p_identifier, p_endpoint);
  SELECT COUNT(*) INTO v_count
  FROM limites_taxa
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND created_at > now() - (p_window_seconds || ' seconds')::interval;
  -- 2026-09-17: a limpeza apagava tudo com mais de 5 min FIXOS, então janela de
  -- 1h (teto de mensagens/hora por chip no outbox) valia na prática por 5 min.
  -- Agora respeita a janela pedida, com piso de 5 min pra não crescer sem limite.
  DELETE FROM limites_taxa
  WHERE created_at < now() - GREATEST((p_window_seconds || ' seconds')::interval, interval '5 minutes');
  RETURN v_count <= p_max_requests;
END;
$function$


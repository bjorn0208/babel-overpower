CREATE OR REPLACE FUNCTION public.tg_disparar_retorno_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_edge_url text;
BEGIN
  -- Só dispara quando status_loop transiciona de aguardando_dono → dono_respondeu
  IF NEW.status_loop = 'dono_respondeu' AND OLD.status_loop = 'aguardando_dono' THEN
    -- Ler URL da edge do vault (placeholder até deploy G8)
    SELECT decrypted_secret
      INTO v_edge_url
      FROM vault.decrypted_secrets
      WHERE name = 'edge_url_retornar_resposta_mentor'
      LIMIT 1;

    IF v_edge_url IS NOT NULL AND v_edge_url <> '' THEN
      PERFORM net.http_post(
        url     := v_edge_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'pergunta_id', NEW.id,
          'tenant_id',   NEW.tenant_id,
          'conversa_id', NEW.conversation_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


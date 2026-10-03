CREATE OR REPLACE FUNCTION public.alternar_checkpoint_publico(p_token uuid, p_checkpoint_id text, p_value boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public.leads
  SET client_checkpoints = jsonb_set(
    COALESCE(client_checkpoints, '{}'::jsonb),
    ARRAY[p_checkpoint_id],
    to_jsonb(p_value)
  )
  WHERE chave_rastreamento = p_token;
$function$


CREATE OR REPLACE FUNCTION public.toggle_public_checkpoint(p_token uuid, p_checkpoint_id text, p_value boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.leads
  SET client_checkpoints = jsonb_set(
    COALESCE(client_checkpoints, '{}'::jsonb),
    ARRAY[p_checkpoint_id],
    to_jsonb(p_value)
  )
  WHERE tracking_token = p_token;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_public_checkpoint(uuid, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.toggle_public_checkpoint(uuid, text, boolean) TO authenticated;
;

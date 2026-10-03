CREATE OR REPLACE FUNCTION public.increment_conversas_usadas(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  UPDATE public.user_subscriptions
  SET conversas_usadas = conversas_usadas + 1,
      updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.increment_conversas_usadas(uuid) TO service_role;
;

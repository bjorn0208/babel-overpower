
CREATE OR REPLACE FUNCTION increment_conversas_usadas(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE user_subscriptions
  SET conversas_usadas = conversas_usadas + 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'active';
$$;

;

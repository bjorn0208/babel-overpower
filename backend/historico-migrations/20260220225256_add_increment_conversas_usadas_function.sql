CREATE OR REPLACE FUNCTION increment_conversas_usadas(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_subscriptions
  SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'active';
END;
$$;
;

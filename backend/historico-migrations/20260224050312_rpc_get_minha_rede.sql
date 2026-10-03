-- RPC SECURITY DEFINER para pagina multinivel do usuario
-- Retorna indicados diretos + count de sub-indicados numa query so
-- Elimina N+1 do frontend e contorna RLS para leitura cross-user
-- Auth check: so owner ou team member do owner pode chamar
CREATE OR REPLACE FUNCTION public.get_minha_rede(p_owner_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz,
  multinivel_ativo boolean,
  sub_indicados bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_owner_id != COALESCE(
    (SELECT p.parent_user_id FROM profiles p WHERE p.id = auth.uid()),
    auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.avatar_url,
    p.created_at,
    p.multinivel_ativo,
    (SELECT count(*) FROM profiles sub WHERE sub.referred_by = p.id) AS sub_indicados
  FROM profiles p
  WHERE p.referred_by = p_owner_id
  ORDER BY p.created_at DESC;
END;
$$;
;

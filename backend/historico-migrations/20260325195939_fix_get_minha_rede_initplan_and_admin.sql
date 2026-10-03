
CREATE OR REPLACE FUNCTION public.get_minha_rede(p_owner_id uuid)
RETURNS TABLE(id uuid, full_name text, email text, avatar_url text, created_at timestamptz, multinivel_ativo boolean, sub_indicados bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Permitir: admin, proprio usuario, ou membro da equipe
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles WHERE public.profiles.id = (SELECT auth.uid()) AND system_role = 'platform_admin')
    OR p_owner_id = COALESCE(
      (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())),
      (SELECT auth.uid())
    )
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
    (SELECT count(*) FROM public.profiles sub WHERE sub.referred_by = p.id) AS sub_indicados
  FROM public.profiles p
  WHERE p.referred_by = p_owner_id
  ORDER BY p.created_at DESC;
END;
$$;

;

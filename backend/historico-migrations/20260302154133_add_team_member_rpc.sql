
-- RPC para adicionar membro a equipe (bypassa RLS do chicken-and-egg)
CREATE OR REPLACE FUNCTION public.add_team_member(
  p_member_id uuid,
  p_permissions text[] DEFAULT '{}'::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verificar que o caller nao é ele mesmo
  IF p_member_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Nao pode adicionar a si mesmo como membro';
  END IF;

  -- Verificar que o profile alvo existe e nao tem parent (nao é membro de outra equipe)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = p_member_id AND parent_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Usuario nao encontrado ou ja pertence a outra equipe';
  END IF;

  -- Setar parent_user_id e permissoes
  UPDATE public.profiles
  SET parent_user_id = (SELECT auth.uid()),
      page_permissions = p_permissions
  WHERE id = p_member_id;
END;
$$;

-- Permissao para authenticated
GRANT EXECUTE ON FUNCTION public.add_team_member(uuid, text[]) TO authenticated;

;

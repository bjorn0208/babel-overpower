
-- Dropar policies recursivas
DROP POLICY IF EXISTS profiles_select_parent ON public.profiles;
DROP POLICY IF EXISTS profiles_select_team ON public.profiles;

-- Funcao SECURITY DEFINER pra pegar parent_user_id sem recursao
CREATE OR REPLACE FUNCTION get_my_parent_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT parent_user_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Membro de equipe ve o profile do dono
CREATE POLICY profiles_select_parent ON public.profiles
  FOR SELECT USING (
    id = get_my_parent_user_id()
  );

-- Membro de equipe ve colegas de equipe do mesmo dono
CREATE POLICY profiles_select_team ON public.profiles
  FOR SELECT USING (
    parent_user_id IS NOT NULL
    AND parent_user_id = get_my_parent_user_id()
  );

;


-- Membro de equipe pode ver o profile do dono
CREATE POLICY profiles_select_parent ON public.profiles
  FOR SELECT USING (
    id = (SELECT parent_user_id FROM public.profiles WHERE id = auth.uid())
  );

-- Membro de equipe pode ver outros membros do mesmo dono
CREATE POLICY profiles_select_team ON public.profiles
  FOR SELECT USING (
    parent_user_id IS NOT NULL
    AND parent_user_id = (SELECT parent_user_id FROM public.profiles WHERE id = auth.uid())
  );

;

CREATE OR REPLACE FUNCTION public.remover_membro_equipe(member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Apenas o owner pode remover seus proprios team members
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = member_id AND parent_user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Membro nao pertence a sua equipe';
  END IF;

  -- Deleta o usuario em auth.users (CASCADE: profiles, agentes_usuario, assinaturas_usuario)
  -- Isso elimina qualquer chance de tenant-fantasma pos-remocao.
  DELETE FROM auth.users WHERE id = member_id;
END;
$function$


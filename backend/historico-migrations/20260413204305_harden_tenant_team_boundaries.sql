-- =============================================================================
-- 1) remove_team_member: deletar usuario completo em vez de criar tenant-fantasma
-- =============================================================================
CREATE OR REPLACE FUNCTION public.remove_team_member(member_id uuid)
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

  -- Deleta o usuario em auth.users (CASCADE: profiles, user_agents, user_subscriptions)
  -- Isso elimina qualquer chance de tenant-fantasma pos-remocao.
  DELETE FROM auth.users WHERE id = member_id;
END;
$function$;

COMMENT ON FUNCTION public.remove_team_member(uuid) IS
  'Remove team member deletando o usuario completamente (auth.users CASCADE). Impede criacao de tenant-fantasma.';

-- =============================================================================
-- 2) Dropar add_team_member legada (funcao morta, superficie de ataque)
--    Criacao de team member deve passar exclusivamente pela edge function.
-- =============================================================================
DROP FUNCTION IF EXISTS public.add_team_member(uuid, text[]);

-- =============================================================================
-- 3) Dropar prevent_parent_reset (ja substituida por prevent_critical_field_change)
-- =============================================================================
DROP FUNCTION IF EXISTS public.prevent_parent_reset() CASCADE;

-- =============================================================================
-- 4) Limpar user_agents orfaos de team members (residuo historico)
-- =============================================================================
DELETE FROM public.user_agents
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE parent_user_id IS NOT NULL
);
;

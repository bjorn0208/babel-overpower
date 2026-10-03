-- =============================================================================
-- 1) Tabela de invitations pendentes (canal seguro entre edge function e trigger)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.pending_team_invitations (
  email text PRIMARY KEY,
  parent_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX IF NOT EXISTS pending_team_invitations_parent_idx
  ON public.pending_team_invitations (parent_user_id);

ALTER TABLE public.pending_team_invitations ENABLE ROW LEVEL SECURITY;
-- Sem policies: só service_role acessa (via edge function)

COMMENT ON TABLE public.pending_team_invitations IS
  'Canal seguro entre create-team-member e handle_new_user trigger. Consumido e deletado na criacao do profile.';

-- =============================================================================
-- 2) handle_new_user: agora consome invitation atomicamente
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_parent_user_id uuid := NULL;
  v_permissions text[] := '{}';
  v_email text := lower(coalesce(new.email, ''));
BEGIN
  -- Procura invitation pendente e nao expirada.
  -- Valida que parent_user_id aponta para um tenant real (parent_user_id IS NULL).
  SELECT inv.parent_user_id, inv.permissions
    INTO v_parent_user_id, v_permissions
  FROM public.pending_team_invitations inv
  JOIN public.profiles p ON p.id = inv.parent_user_id AND p.parent_user_id IS NULL
  WHERE inv.email = v_email
    AND inv.expires_at > now()
  LIMIT 1;

  -- Consome o invitation (existindo ou nao — cleanup de lixo expirado do mesmo email)
  DELETE FROM public.pending_team_invitations WHERE email = v_email;

  -- Cria profile com parent_user_id ATOMICAMENTE (nao existe janela onde aparece como tenant)
  INSERT INTO public.profiles (id, full_name, email, parent_user_id, page_permissions)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    v_parent_user_id,
    COALESCE(v_permissions, '{}')
  );

  -- Cria user_agents APENAS para tenants (team members nao tem agente proprio)
  IF v_parent_user_id IS NULL THEN
    INSERT INTO public.user_agents (user_id, nome_agente) VALUES (new.id, '');
  END IF;

  RETURN new;
END;
$function$;

-- =============================================================================
-- 3) profiles_update_own: remove subqueries recursivas (causavam infinite recursion)
--    A protecao de parent_user_id e system_role passa a ser feita via trigger.
-- =============================================================================
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- =============================================================================
-- 4) Trigger de protecao critica: bloqueia mudanca de parent_user_id e system_role
--    Supersede o trg_prevent_parent_reset (mais abrangente).
-- =============================================================================
DROP TRIGGER IF EXISTS trg_prevent_parent_reset ON public.profiles;

CREATE OR REPLACE FUNCTION public.prevent_critical_field_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Bypass explicito via setting de sessao (usado por RPCs admin como remove_team_member)
  IF current_setting('app.bypass_profile_guard', true) = 'true' THEN
    RETURN NEW;
  END IF;
  -- Retrocompat: tambem aceita o setting antigo app.allow_parent_reset
  IF current_setting('app.allow_parent_reset', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Bloqueia mudanca de system_role (previne auto-promocao a platform_admin)
  IF OLD.system_role IS DISTINCT FROM NEW.system_role THEN
    RAISE EXCEPTION 'Nao e permitido alterar system_role sem bypass autorizado.'
      USING ERRCODE = '42501';
  END IF;

  -- Bloqueia qualquer mudanca em parent_user_id (promocao/democao entre tenant/team)
  IF OLD.parent_user_id IS DISTINCT FROM NEW.parent_user_id THEN
    RAISE EXCEPTION 'Nao e permitido alterar parent_user_id sem bypass autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_prevent_critical_field_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_critical_field_change();

COMMENT ON FUNCTION public.prevent_critical_field_change() IS
  'Protege system_role e parent_user_id contra alteracao indevida. Supersede trg_prevent_parent_reset.';

-- =============================================================================
-- 5) View de auditoria: detecta inconsistencias de profile
-- =============================================================================
CREATE OR REPLACE VIEW public.v_profile_health AS
SELECT
  p.id,
  p.email,
  p.full_name,
  p.parent_user_id,
  p.system_role,
  CASE
    WHEN p.parent_user_id IS NULL AND ua.user_id IS NULL THEN 'tenant_sem_agente'
    WHEN p.parent_user_id IS NOT NULL AND ua.user_id IS NOT NULL THEN 'team_com_agente_orfao'
    WHEN p.parent_user_id IS NOT NULL AND p.system_role = 'platform_admin' THEN 'team_como_admin'
    WHEN p.parent_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles pp WHERE pp.id = p.parent_user_id AND pp.parent_user_id IS NULL
    ) THEN 'parent_invalido'
    ELSE 'ok'
  END AS status_integridade
FROM public.profiles p
LEFT JOIN public.user_agents ua ON ua.user_id = p.id;

COMMENT ON VIEW public.v_profile_health IS
  'Auditoria de integridade: detecta profiles em estado inconsistente (team-as-tenant, agentes orfaos, etc).';

-- =============================================================================
-- 6) Limpeza automatica de invitations expirados (>1h)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_team_invitations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.pending_team_invitations
   WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;
;

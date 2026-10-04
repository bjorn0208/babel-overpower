-- B-06: Hardening do trigger prevenir_mudanca_campo_critico
-- Remove bypass via GUC app.bypass_profile_guard (qualquer SQL pode setar)
-- Substitui por verificação de current_user = postgres ou service_role
CREATE OR REPLACE FUNCTION public.prevenir_mudanca_campo_critico() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Bypass apenas para superuser (postgres) ou service_role
  IF current_user IN ('postgres', 'service_role') THEN
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
$$;

COMMENT ON FUNCTION public.prevenir_mudanca_campo_critico() IS 'Protege system_role e parent_user_id contra alteracao indevida. Bypass restrito a postgres/service_role (B-06 fix).';

-- B-07: Revoke EXECUTE on functions from anon by default
-- Previne que novas funções em public sejam automaticamente executáveis por anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

-- Nota: funções existentes com GRANT explícito para anon permanecem até revoke individual
-- A auditoria identificou 94 funções; revoke em massa requer script separado após validação
-- Apenas bloqueando o default privilege para funções futuras neste commit
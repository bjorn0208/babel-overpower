-- Wrapper emergencial pra restaurar 13 RPCs quebradas em produção (2026-05-06).
-- Big-Bang renomeou is_platform_admin → eh_admin_plataforma mas 13 funções
-- no banco continuaram chamando o nome velho.
-- DÍVIDA: regerar as 13 funções com nome novo + DROP deste wrapper.
-- Tracker: documentos/operacao/2026-05/2026-05-06/1403-andamento-fix-emergencial-is-platform-admin.md

CREATE OR REPLACE FUNCTION public.is_platform_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT public.eh_admin_plataforma();
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin()
  TO anon, authenticated, service_role, postgres;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'WRAPPER EMERGENCIAL 2026-05-06 — aponta pra eh_admin_plataforma(). 13 RPCs internas ainda chamam o nome velho. DROPAR após regerar as 13 com nome novo. Ver documentos/operacao/2026-05/2026-05-06/1403-... .md';

NOTIFY pgrst, 'reload schema';
;

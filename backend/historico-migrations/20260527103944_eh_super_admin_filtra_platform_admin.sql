-- Bug histórico: eh_super_admin(uuid) filtra system_role='admin', mas
-- ninguém no banco tem esse role — todos são 'platform_admin' (Theus) ou 'user'.
-- Função sempre retornava FALSE, quebrando silenciosamente 12 policies (cargos,
-- cargo_ferramentas, cargo_diretrizes, cargo_tarefas, ferramentas_dinamicas,
-- ferramentas_log, gatilhos_reativos, impersonation_log×3, prompts_turno, traces).
--
-- Theus cravou autorização em 2026-05-27 07:35 BRT.
-- Aceita ambos os roles ('platform_admin' e 'admin') pra compatibilidade futura.

CREATE OR REPLACE FUNCTION public.eh_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND system_role IN ('platform_admin', 'admin')
  );
$function$;

COMMENT ON FUNCTION public.eh_super_admin(uuid) IS
  'Retorna true se o user é super-admin da plataforma (system_role platform_admin ou admin). Fix 2026-05-27: antes filtrava só admin que ninguém tinha, quebrando 12 policies silenciosamente.';
;

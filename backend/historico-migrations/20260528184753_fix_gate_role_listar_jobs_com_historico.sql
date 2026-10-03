-- Re-auditoria rodada 2 follow-up: 3 das 4 RPCs UI admin (ativar_recurso_curadoria,
-- pausar_recurso_curadoria, togglar_job) JÁ tinham gate IF NOT EXISTS user_roles.role.
-- Só listar_jobs_com_historico() estava aberta. Como é SQL function (não plpgsql) e
-- retorna TABLE, recria como LANGUAGE plpgsql com RAISE EXCEPTION no topo.

CREATE OR REPLACE FUNCTION public.listar_jobs_com_historico()
RETURNS TABLE(
  nome text,
  descricao text,
  categoria text,
  cron_expr text,
  ativo boolean,
  jobid_pg_cron integer,
  ultima_exec timestamp with time zone,
  status_ultima text,
  falhas_7d bigint,
  sucessos_7d bigint,
  duracao_media_ms numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
      AND role IN ('admin','platform_admin')
  ) THEN
    RAISE EXCEPTION 'sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT ac.nome, ac.descricao, ac.categoria, ac.cron_expr, ac.ativo,
           ac.jobid_pg_cron, s.ultima_exec, s.status_ultima,
           COALESCE(s.falhas_7d, 0), COALESCE(s.sucessos_7d, 0), s.duracao_media_ms
    FROM public.agendamentos_config ac
    LEFT JOIN public.vw_cron_saude s ON s.jobid = ac.jobid_pg_cron
    ORDER BY ac.categoria, ac.nome;
END;
$function$;
;

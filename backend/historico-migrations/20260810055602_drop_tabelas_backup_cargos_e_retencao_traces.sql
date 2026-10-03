-- Higiene da biblioteca de dados (auditoria 2026-08-10):
-- 1. Tabelas backup de 2026-05-26 dropadas — conteúdo arquivado em
--    arquivo/dump-tabelas-backup-cargos-2026-05-26_arquivado-2026-08-10.json (104 + 849 linhas).
DROP TABLE IF EXISTS public.cargos_backup_2026_05_26;
DROP TABLE IF EXISTS public.cargo_ferramentas_backup_2026_05_26;

-- 2. Retenção de traces (maior tabela do banco, 300k linhas, sem teto):
--    apaga traces com mais de 90 dias, semanal. Espelha precedente do logs_requisicao_llm (30d).
CREATE OR REPLACE FUNCTION public.limpar_traces_antigos()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_apagados int;
BEGIN
  WITH apagar AS (
    DELETE FROM public.traces
    WHERE criado_em < now() - interval '90 days'
    RETURNING id
  )
  SELECT count(*)::int INTO v_apagados FROM apagar;
  RETURN v_apagados;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.limpar_traces_antigos() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-traces-antigos') THEN
    PERFORM cron.unschedule('limpar-traces-antigos');
  END IF;
END
$do$;

SELECT cron.schedule(
  'limpar-traces-antigos',
  '30 6 * * 0',
  'SELECT public.limpar_traces_antigos();'
);
;

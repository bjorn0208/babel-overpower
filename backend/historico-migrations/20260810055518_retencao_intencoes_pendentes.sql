-- intencoes_pendentes é telemetria por turno (Sistema 2): o motor só relê a mais
-- recente por conversa. Sem retenção acumulava sem teto (32,8k, mais antiga 88d).
-- Mantém as 5 últimas por conversa + tudo com menos de 30 dias.
CREATE OR REPLACE FUNCTION public.limpar_intencoes_antigas()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_apagadas int;
BEGIN
  WITH ranqueadas AS (
    SELECT id,
           row_number() OVER (PARTITION BY conversa_id ORDER BY criado_em DESC) AS pos
    FROM public.intencoes_pendentes
  ),
  apagar AS (
    DELETE FROM public.intencoes_pendentes ip
    USING ranqueadas r
    WHERE ip.id = r.id
      AND r.pos > 5
      AND ip.criado_em < now() - interval '30 days'
    RETURNING ip.id
  )
  SELECT count(*)::int INTO v_apagadas FROM apagar;
  RETURN v_apagadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.limpar_intencoes_antigas() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-intencoes-antigas') THEN
    PERFORM cron.unschedule('limpar-intencoes-antigas');
  END IF;
END
$do$;

SELECT cron.schedule(
  'limpar-intencoes-antigas',
  '0 6 * * 0',
  'SELECT public.limpar_intencoes_antigas();'
);
;

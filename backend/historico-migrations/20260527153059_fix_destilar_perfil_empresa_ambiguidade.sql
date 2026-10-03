-- Fix ambiguidade tenant_id (PL/pgSQL OUT param conflitava com coluna)
DROP FUNCTION IF EXISTS public.destilar_perfil_empresa(uuid);

CREATE OR REPLACE FUNCTION public.destilar_perfil_empresa(p_tenant_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_destilados int := 0;
BEGIN
  WITH tenants_alvo AS (
    SELECT DISTINCT l.tenant_id AS tid
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
  ),
  metricas AS (
    SELECT
      t.tid,
      count(*) FILTER (WHERE l.desfecho = 'convertido') AS convertidos,
      count(*) FILTER (WHERE l.desfecho IN ('convertido','sumido','recusado','desqualificado')) AS fechados,
      count(*) AS total_leads,
      (SELECT n.nome_exibicao FROM public.profiles p
        JOIN public.nichos n ON n.id = p.nicho_id
        WHERE p.id = t.tid LIMIT 1) AS segmento
    FROM tenants_alvo t
    LEFT JOIN public.leads l ON l.tenant_id = t.tid AND l.deleted_at IS NULL
    GROUP BY t.tid
  ),
  upserts AS (
    INSERT INTO public.perfil_empresa AS pe (
      tenant_id, segmento, taxa_conversao_estimada, conversas_destiladas,
      destilacao_ultima_em
    )
    SELECT
      tid,
      segmento,
      CASE WHEN fechados > 0 THEN round(convertidos::numeric / fechados, 4) ELSE NULL END,
      total_leads,
      now()
    FROM metricas
    WHERE tid IS NOT NULL
    ON CONFLICT (tenant_id) DO UPDATE SET
      segmento = excluded.segmento,
      taxa_conversao_estimada = excluded.taxa_conversao_estimada,
      conversas_destiladas = excluded.conversas_destiladas,
      destilacao_ultima_em = now(),
      versao = pe.versao + 1,
      atualizado_em = now()
    RETURNING pe.tenant_id
  )
  SELECT count(*)::int INTO v_destilados FROM upserts;

  RETURN v_destilados;
END;
$$;

COMMENT ON FUNCTION public.destilar_perfil_empresa IS
  'Trilho B3-fase-2 V1 — destila metricas quantitativas em perfil_empresa. Retorna numero de tenants destilados.';

REVOKE EXECUTE ON FUNCTION public.destilar_perfil_empresa(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.destilar_perfil_empresa(uuid) TO service_role;

-- Recriar cron com nova assinatura
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-destilar-perfil-empresa') THEN
    PERFORM cron.unschedule('cron-destilar-perfil-empresa');
  END IF;
  PERFORM cron.schedule(
    'cron-destilar-perfil-empresa',
    '0 4 * * 0',
    $sql$SELECT public.destilar_perfil_empresa(NULL);$sql$
  );
END $$;
;

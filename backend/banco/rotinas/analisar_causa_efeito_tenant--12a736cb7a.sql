CREATE OR REPLACE FUNCTION public.analisar_causa_efeito_tenant(p_tenant_id uuid)
 RETURNS TABLE(metrica text, ferramenta_ou_cargo text, n_amostras bigint, taxa_conversao_quando_usada numeric, taxa_conversao_geral numeric, diferenca_pp numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_taxa_geral numeric;
BEGIN
  -- Taxa geral
  SELECT 
    CASE WHEN count(*) FILTER (WHERE desfecho IN ('convertido','perdido','sumiu')) > 0
      THEN count(*) FILTER (WHERE desfecho='convertido')::numeric 
        / count(*) FILTER (WHERE desfecho IN ('convertido','perdido','sumiu')) 
      ELSE 0 END
  INTO v_taxa_geral
  FROM public.leads
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  RETURN QUERY
  -- Análise por cargo final usado
  WITH leads_classificados AS (
    SELECT l.id, l.desfecho, l.cargo_ativo_id
    FROM public.leads l
    WHERE l.tenant_id = p_tenant_id 
      AND l.deleted_at IS NULL 
      AND l.desfecho IN ('convertido','perdido','sumiu')
  )
  SELECT
    'cargo_final'::text AS metrica,
    coalesce(c.nome, 'sem_cargo') AS ferramenta_ou_cargo,
    count(*) AS n_amostras,
    (count(*) FILTER (WHERE lc.desfecho='convertido')::numeric / NULLIF(count(*), 0))::numeric(5,4) AS taxa_quando,
    v_taxa_geral::numeric(5,4) AS taxa_geral,
    ((count(*) FILTER (WHERE lc.desfecho='convertido')::numeric / NULLIF(count(*), 0)) - v_taxa_geral)::numeric(5,4) AS diff
  FROM leads_classificados lc
  LEFT JOIN public.cargos c ON c.id = lc.cargo_ativo_id
  GROUP BY c.nome
  HAVING count(*) >= 5
  ORDER BY diff DESC NULLS LAST;
END;
$function$


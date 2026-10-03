-- ============================================================================
-- Fechamento — B4 análise causa-efeito (V1 SQL puro) + G10 auto-ajuste pesos
-- ============================================================================

-- B4: função SQL pura que estima efeito de cada ferramenta no funil
-- (V2 com X-Learner fica pra depois — V1 é proxy descritivo já útil)
CREATE OR REPLACE FUNCTION public.analisar_causa_efeito_tenant(p_tenant_id uuid)
RETURNS TABLE (
  metrica text,
  ferramenta_ou_cargo text,
  n_amostras bigint,
  taxa_conversao_quando_usada numeric,
  taxa_conversao_geral numeric,
  diferenca_pp numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.analisar_causa_efeito_tenant TO authenticated, service_role;

-- G10: extender config_chamadas_llm.gavetas_ativas — campo peso_aprendido (jsonb)
-- Estrutura final por gaveta: {ativo, piso, top_n, peso_aprendido}
-- Função recalcula pesos baseado em sucesso/falha cruzando perfil_empresa.argumentos_*

CREATE OR REPLACE FUNCTION public.recalcular_pesos_gavetas_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resultado jsonb := '{}'::jsonb;
BEGIN
  -- V1 placeholder: registra que rodou. V2 implementa lógica real de peso
  -- baseada em quantas vezes cada gaveta foi consultada em conversas convertidas vs perdidas.
  
  -- Pra V1: incrementa contador simbólico
  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'recalculado_em', now(),
    'nota', 'V1 placeholder — implementação real do feedback loop pendente. Estrutura pronta pra V2.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_pesos_gavetas_tenant TO authenticated, service_role;

-- Atualizar status do B4 e G10 nos recursos (agora têm infra)
UPDATE public.recursos_ativacao_curadoria 
SET descricao_longa = descricao_longa || ' [V1 disponível em produção — função analisar_causa_efeito_tenant.]'
WHERE chave_recurso = 'analise_causa_efeito';

UPDATE public.recursos_ativacao_curadoria 
SET descricao_longa = descricao_longa || ' [V1 estrutura pronta (recalcular_pesos_gavetas_tenant) — lógica completa do feedback fica pra V2.]'
WHERE chave_recurso = 'auto_ajuste_pesos_gavetas';

;

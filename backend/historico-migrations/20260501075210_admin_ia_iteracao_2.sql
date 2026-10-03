-- Identidade rica
ALTER TABLE public.admin_ia_config
  ADD COLUMN IF NOT EXISTS cargo text DEFAULT 'Sócio técnico do administrador',
  ADD COLUMN IF NOT EXISTS personalidade text DEFAULT 'Direto, técnico, sem firulas. pt-BR. Cita evidência.';

-- Tools desabilitadas
CREATE TABLE IF NOT EXISTS public.admin_ia_tools_disabled (
  tool_name text PRIMARY KEY,
  desativada_em timestamptz NOT NULL DEFAULT now(),
  desativada_por uuid
);

ALTER TABLE public.admin_ia_tools_disabled ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_ia_tools_disabled_admin_all" ON public.admin_ia_tools_disabled
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

-- RPC custo histórico mensal (últimos N meses)
CREATE OR REPLACE FUNCTION public.admin_ia_custo_historico_meses(p_meses integer DEFAULT 12)
RETURNS TABLE (
  mes_inicio timestamptz,
  custo_total numeric,
  custo_llm numeric,
  custo_embed numeric,
  custo_rerank numeric,
  total_chamadas bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH meses AS (
    SELECT generate_series(
      date_trunc('month', now()) - ((p_meses - 1) || ' months')::interval,
      date_trunc('month', now()),
      '1 month'::interval
    ) AS mes
  )
  SELECT
    m.mes AS mes_inicio,
    coalesce(sum(l.custo_total), 0)::numeric AS custo_total,
    coalesce(sum(l.custo_total) FILTER (WHERE l.tipo = 'admin_ia_chat'), 0)::numeric AS custo_llm,
    coalesce(sum(l.custo_total) FILTER (WHERE l.tipo IN ('embed_chunk','embed_query') AND l.metadata->>'origem' = 'admin_ia'), 0)::numeric AS custo_embed,
    coalesce(sum(l.custo_total) FILTER (WHERE l.tipo = 'admin_ia_rerank'), 0)::numeric AS custo_rerank,
    count(l.id) FILTER (WHERE l.tipo LIKE 'admin_ia%' OR (l.tipo IN ('embed_chunk','embed_query') AND l.metadata->>'origem' = 'admin_ia'))::bigint AS total_chamadas
  FROM meses m
  LEFT JOIN public.llm_request_logs l
    ON l.created_at >= m.mes AND l.created_at < m.mes + '1 month'::interval
  GROUP BY m.mes
  ORDER BY m.mes ASC;
END;
$$;

COMMENT ON FUNCTION public.admin_ia_custo_historico_meses IS 'Custo Admin IA agregado por mês — útil pra modal histórico no UI.';
;

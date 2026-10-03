
CREATE TABLE IF NOT EXISTS public.rate_limit_tenant (
  tenant_id uuid NOT NULL,
  janela timestamptz NOT NULL,
  contador integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, janela)
);

ALTER TABLE public.rate_limit_tenant ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limit_tenant_admin_only" ON public.rate_limit_tenant;
CREATE POLICY "rate_limit_tenant_admin_only"
ON public.rate_limit_tenant FOR ALL
TO authenticated
USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_rate_limit_tenant_janela
  ON public.rate_limit_tenant (janela);

CREATE OR REPLACE FUNCTION public.fn_rate_limit_consumir(
  _tenant_id uuid,
  _limite_por_min integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _janela timestamptz := date_trunc('minute', now());
  _atual integer;
BEGIN
  INSERT INTO public.rate_limit_tenant (tenant_id, janela, contador)
  VALUES (_tenant_id, _janela, 1)
  ON CONFLICT (tenant_id, janela)
  DO UPDATE SET contador = public.rate_limit_tenant.contador + 1
  RETURNING contador INTO _atual;
  RETURN _atual <= _limite_por_min;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_rate_limit_limpar()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ DELETE FROM public.rate_limit_tenant WHERE janela < now() - interval '1 hour'; $$;

CREATE OR REPLACE VIEW public.vw_metricas_motor_dia AS
SELECT
  tenant_id,
  date_trunc('day', criado_em)::date AS dia,
  tipo,
  modelo_llm,
  count(*) AS total_eventos,
  sum(coalesce(custo_tokens_in, 0))  AS tokens_in,
  sum(coalesce(custo_tokens_out, 0)) AS tokens_out,
  avg(latencia_ms)::integer          AS latencia_media_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia_ms)::integer AS p95_latencia_ms
FROM public.traces
WHERE criado_em >= now() - interval '30 days'
GROUP BY 1,2,3,4;

CREATE OR REPLACE VIEW public.vw_metricas_ferramentas_dia AS
SELECT
  tenant_id,
  date_trunc('day', criado_em)::date AS dia,
  tool_name AS ferramenta_nome,
  count(*) FILTER (WHERE status = 'sucesso') AS sucessos,
  count(*) FILTER (WHERE status <> 'sucesso') AS falhas,
  count(*) AS total
FROM public.invocacoes_ferramenta
WHERE criado_em >= now() - interval '30 days'
GROUP BY 1,2,3;

CREATE OR REPLACE FUNCTION public.fn_saude_motor()
RETURNS TABLE (fila text, pendentes bigint, ultimo_evento timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.queue_name::text,
    coalesce(m.queue_length, 0)::bigint,
    m.newest_msg_age_sec::timestamptz
  FROM pgmq.list_queues() q
  LEFT JOIN LATERAL (SELECT * FROM pgmq.metrics(q.queue_name)) m ON true
  WHERE q.queue_name LIKE 'fila_%';
EXCEPTION WHEN OTHERS THEN RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_metricas_motor(_tenant_id uuid DEFAULT NULL, _dias integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _resultado jsonb;
BEGIN
  SELECT jsonb_build_object(
    'periodo_dias', _dias,
    'tenant_id', _tenant_id,
    'gerado_em', now(),
    'totais_traces', (
      SELECT jsonb_build_object(
        'eventos', count(*),
        'tokens_in', coalesce(sum(custo_tokens_in), 0),
        'tokens_out', coalesce(sum(custo_tokens_out), 0),
        'p95_latencia_ms', percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia_ms)::integer
      )
      FROM public.traces
      WHERE criado_em >= now() - (_dias || ' days')::interval
        AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
    ),
    'ferramentas', (
      SELECT jsonb_agg(jsonb_build_object(
        'nome', tool_name,
        'sucessos', sucessos,
        'falhas', falhas
      ))
      FROM (
        SELECT tool_name,
          count(*) FILTER (WHERE status = 'sucesso') AS sucessos,
          count(*) FILTER (WHERE status <> 'sucesso') AS falhas
        FROM public.invocacoes_ferramenta
        WHERE criado_em >= now() - (_dias || ' days')::interval
          AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
        GROUP BY tool_name ORDER BY count(*) DESC LIMIT 20
      ) t
    ),
    'saude_filas', (SELECT jsonb_agg(to_jsonb(s)) FROM public.fn_saude_motor() s)
  ) INTO _resultado;
  RETURN _resultado;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rate_limit_limpar') THEN
    PERFORM cron.schedule('rate_limit_limpar', '*/10 * * * *', $cron$SELECT public.fn_rate_limit_limpar();$cron$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'traces_arquivar_antigos') THEN
    PERFORM cron.schedule('traces_arquivar_antigos', '0 3 * * *',
      $cron$DELETE FROM public.traces WHERE criado_em < now() - interval '90 days';$cron$);
  END IF;
END $$;

;

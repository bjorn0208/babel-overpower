-- custos_llm_dia — gasto LLM da plataforma por dia × modelo × endpoint.
-- Fonte: GET /api/v1/activity do OpenRouter (management key no vault como
-- 'openrouter_management_key'), que só guarda os últimos 30 dias completos (UTC).
-- A edge cron-coletar-custos-llm faz UPSERT diário aqui e o histórico cresce sem limite.
-- Consumidor: app Controle (admin) — planilha de gastos por período + export Excel.
-- Down: DROP TABLE public.custos_llm_dia;
--       DROP FUNCTION public.ler_chave_gestao_openrouter();
--       SELECT cron.unschedule('coletar-custos-llm');

SET lock_timeout = '4s';
SET statement_timeout = '60s';

-- 1. Tabela (dados agregados de telemetria — sem soft delete, mesmo padrão de logs_requisicao_llm)
CREATE TABLE IF NOT EXISTS public.custos_llm_dia (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dia date NOT NULL,
  modelo text NOT NULL DEFAULT '',
  modelo_permaslug text NOT NULL DEFAULT '',
  endpoint_id text NOT NULL DEFAULT '',
  provedor text NOT NULL DEFAULT '',
  requisicoes bigint NOT NULL DEFAULT 0,
  tokens_entrada bigint NOT NULL DEFAULT 0,
  tokens_saida bigint NOT NULL DEFAULT 0,
  tokens_raciocinio bigint NOT NULL DEFAULT 0,
  custo_usd numeric NOT NULL DEFAULT 0,
  custo_byok_usd numeric NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custos_llm_dia_pkey PRIMARY KEY (id),
  CONSTRAINT custos_llm_dia_dia_endpoint_unico UNIQUE (dia, endpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_custos_llm_dia_dia ON public.custos_llm_dia (dia DESC);
CREATE INDEX IF NOT EXISTS idx_custos_llm_dia_modelo ON public.custos_llm_dia (modelo);

-- 2. RLS — só admin da plataforma enxerga (escrita fica com service_role via edge)
ALTER TABLE public.custos_llm_dia ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'custos_llm_dia'
      AND policyname = 'admin_le_custos_llm_dia'
  ) THEN
    CREATE POLICY "admin_le_custos_llm_dia" ON public.custos_llm_dia
      FOR SELECT TO authenticated
      USING ((SELECT public.eh_admin_plataforma()));
  END IF;
END $$;

-- 3. RPC pra edge ler a management key do vault (service_role apenas)
CREATE OR REPLACE FUNCTION public.ler_chave_gestao_openrouter()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'openrouter_management_key'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.ler_chave_gestao_openrouter() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ler_chave_gestao_openrouter() FROM anon;
REVOKE ALL ON FUNCTION public.ler_chave_gestao_openrouter() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ler_chave_gestao_openrouter() TO service_role;

-- 4. Cron diário 01:00 UTC (22:00 BRT) — docs do OpenRouter recomendam esperar
-- ~30min após a virada UTC pra pegar o dia anterior fechado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'coletar-custos-llm') THEN
    PERFORM cron.unschedule('coletar-custos-llm');
  END IF;
END $$;

SELECT cron.schedule(
  'coletar-custos-llm',
  '0 1 * * *',
  $$
    SELECT net.http_post(
      url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-coletar-custos-llm',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'service_role_key'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    )
    WHERE EXISTS (
      SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key'
    );
  $$
);
;

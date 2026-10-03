-- ============================================================================
-- Onda 6.1 — Higiene C0 atômica
-- 1) Drop 3 crons mortos (8.249 falhas/30d acumuladas)
-- 2) DESLIGAR cron-agregar-comparativo-nicho (R4 — preventivo LGPD)
-- 3) Drop RPC legada busca_hibrida_episodica (0 callers reais)
-- 4) Rename campos_ficha.niche_id → nicho_id (Big-Bang missed)
-- ============================================================================

-- 1) Drop crons mortos (idempotente — IF EXISTS via DO block)
DO $$
DECLARE
  v_job text;
  v_mortos text[] := ARRAY[
    'limpar-travas-lead-expiradas',
    'limpar-entregas-pendentes',
    'calcular_perfil_estilo_horario',
    'cron-agregar-comparativo-nicho'  -- R4: desligar até parecer LGPD aprovado
  ];
BEGIN
  FOREACH v_job IN ARRAY v_mortos LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job) THEN
      PERFORM cron.unschedule(v_job);
      RAISE NOTICE 'Cron desativado: %', v_job;
    END IF;
  END LOOP;
END$$;

-- 2) Drop RPC legada (plpgsql; substituída por busca_hibrida_memoria_episodica sql)
DROP FUNCTION IF EXISTS public.busca_hibrida_episodica(uuid, text, integer, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.busca_hibrida_episodica(uuid, text, integer);
DROP FUNCTION IF EXISTS public.busca_hibrida_episodica;

-- 3) Rename coluna (Postgres atualiza FK + 3 índices automaticamente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='campos_ficha' AND column_name='niche_id'
  ) THEN
    ALTER TABLE public.campos_ficha RENAME COLUMN niche_id TO nicho_id;
    RAISE NOTICE 'Coluna campos_ficha.niche_id renomeada para nicho_id';
  END IF;
END$$;

;

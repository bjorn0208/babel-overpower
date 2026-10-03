-- Curadoria v2 · F4 · cria 7 tabelas pro Laboratório + coluna messages.chunks_acionados
-- RLS: somente platform_admin lê/escreve. FK indexed. Soft-delete onde faz sentido.

-- 1. GOLDEN CHUNKS — cenários de teste
CREATE TABLE IF NOT EXISTS public.golden_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  intent text,
  persona_simulada uuid REFERENCES public.agente_identidade(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  mensagens jsonb NOT NULL DEFAULT '[]'::jsonb,
  resultado_esperado jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  escopo text NOT NULL DEFAULT 'global',
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS golden_chunks_persona_idx ON public.golden_chunks(persona_simulada);
CREATE INDEX IF NOT EXISTS golden_chunks_nicho_idx ON public.golden_chunks(nicho_id);
CREATE INDEX IF NOT EXISTS golden_chunks_tenant_idx ON public.golden_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS golden_chunks_criado_por_idx ON public.golden_chunks(criado_por);
CREATE INDEX IF NOT EXISTS golden_chunks_ativos_idx ON public.golden_chunks(escopo) WHERE deleted_at IS NULL AND ativo;
ALTER TABLE public.golden_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY golden_chunks_admin_all ON public.golden_chunks
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 2. GOLDEN RUN BATCHES — execuções
CREATE TABLE IF NOT EXISTS public.golden_run_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text,
  escopo text NOT NULL DEFAULT 'global',
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  modelo text,
  total_cenarios integer NOT NULL DEFAULT 0,
  total_passou integer NOT NULL DEFAULT 0,
  total_falhou integer NOT NULL DEFAULT 0,
  total_regression integer NOT NULL DEFAULT 0,
  custo_brl numeric(10,4) NOT NULL DEFAULT 0,
  duracao_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  iniciado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz
);
CREATE INDEX IF NOT EXISTS golden_run_batches_nicho_idx ON public.golden_run_batches(nicho_id);
CREATE INDEX IF NOT EXISTS golden_run_batches_tenant_idx ON public.golden_run_batches(tenant_id);
CREATE INDEX IF NOT EXISTS golden_run_batches_iniciado_por_idx ON public.golden_run_batches(iniciado_por);
CREATE INDEX IF NOT EXISTS golden_run_batches_recentes_idx ON public.golden_run_batches(iniciado_em DESC);
ALTER TABLE public.golden_run_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY golden_run_batches_admin_all ON public.golden_run_batches
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 3. GOLDEN RUNS — 1 row por (batch, cenário)
CREATE TABLE IF NOT EXISTS public.golden_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.golden_run_batches(id) ON DELETE CASCADE,
  cenario_id uuid NOT NULL REFERENCES public.golden_chunks(id) ON DELETE CASCADE,
  passou boolean,
  is_regression boolean NOT NULL DEFAULT false,
  diff jsonb,
  obtido jsonb,
  esperado jsonb,
  custo_brl numeric(10,4) NOT NULL DEFAULT 0,
  duracao_ms integer,
  modelo text,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS golden_runs_batch_idx ON public.golden_runs(batch_id);
CREATE INDEX IF NOT EXISTS golden_runs_cenario_idx ON public.golden_runs(cenario_id);
CREATE INDEX IF NOT EXISTS golden_runs_regression_idx ON public.golden_runs(is_regression) WHERE is_regression;
CREATE INDEX IF NOT EXISTS golden_runs_recentes_idx ON public.golden_runs(criado_em DESC);
ALTER TABLE public.golden_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY golden_runs_admin_all ON public.golden_runs
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 4. GOLDEN CALIBRATION — amostras humano vs verificador
CREATE TABLE IF NOT EXISTS public.golden_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  verificador_label text,
  verificador_score numeric,
  humano_label text,
  humano_score numeric,
  decidido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decidido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS golden_calibration_batch_idx ON public.golden_calibration(batch_id);
CREATE INDEX IF NOT EXISTS golden_calibration_message_idx ON public.golden_calibration(message_id);
CREATE INDEX IF NOT EXISTS golden_calibration_conv_idx ON public.golden_calibration(conversation_id);
CREATE INDEX IF NOT EXISTS golden_calibration_decidido_por_idx ON public.golden_calibration(decidido_por);
CREATE INDEX IF NOT EXISTS golden_calibration_pending_idx ON public.golden_calibration(criado_em) WHERE humano_label IS NULL;
ALTER TABLE public.golden_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY golden_calibration_admin_all ON public.golden_calibration
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 5. CANARY ROLLOUTS — experimentos
CREATE TABLE IF NOT EXISTS public.canary_rollouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  escopo text NOT NULL DEFAULT 'global',
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  mudancas jsonb NOT NULL DEFAULT '{}'::jsonb,
  pct_trafego integer NOT NULL DEFAULT 5,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  criterios_promocao jsonb NOT NULL DEFAULT '{}'::jsonb,
  criterios_rollback jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'rascunho',
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  decidido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decidido_em timestamptz,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS canary_rollouts_nicho_idx ON public.canary_rollouts(nicho_id);
CREATE INDEX IF NOT EXISTS canary_rollouts_tenant_idx ON public.canary_rollouts(tenant_id);
CREATE INDEX IF NOT EXISTS canary_rollouts_criado_por_idx ON public.canary_rollouts(criado_por);
CREATE INDEX IF NOT EXISTS canary_rollouts_decidido_por_idx ON public.canary_rollouts(decidido_por);
CREATE INDEX IF NOT EXISTS canary_rollouts_ativos_idx ON public.canary_rollouts(status) WHERE deleted_at IS NULL AND status IN ('ativo','pausado');
ALTER TABLE public.canary_rollouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY canary_rollouts_admin_all ON public.canary_rollouts
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 6. CANARY ASSIGNMENTS — atribuição conversa→canary
CREATE TABLE IF NOT EXISTS public.canary_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canary_id uuid NOT NULL REFERENCES public.canary_rollouts(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  variante text NOT NULL,
  atribuido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canary_assignments_canary_idx ON public.canary_assignments(canary_id);
CREATE INDEX IF NOT EXISTS canary_assignments_conv_idx ON public.canary_assignments(conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS canary_assignments_unica_idx ON public.canary_assignments(canary_id, conversation_id);
ALTER TABLE public.canary_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY canary_assignments_admin_all ON public.canary_assignments
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 7. ORPHAN QUESTIONS — clusters de perguntas órfãs
CREATE TABLE IF NOT EXISTS public.orphan_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  cluster_id text,
  titulo text,
  pergunta_representativa text NOT NULL,
  intents_inferidas text[] NOT NULL DEFAULT '{}',
  num_perguntas integer NOT NULL DEFAULT 1,
  num_leads integer NOT NULL DEFAULT 1,
  resolvido boolean NOT NULL DEFAULT false,
  resolvido_em timestamptz,
  resolvido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolvido_chunk_id uuid,
  embedding_amostra vector,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orphan_questions_tenant_idx ON public.orphan_questions(tenant_id);
CREATE INDEX IF NOT EXISTS orphan_questions_cluster_idx ON public.orphan_questions(cluster_id);
CREATE INDEX IF NOT EXISTS orphan_questions_resolvido_por_idx ON public.orphan_questions(resolvido_por);
CREATE INDEX IF NOT EXISTS orphan_questions_pendentes_idx ON public.orphan_questions(criado_em DESC) WHERE NOT resolvido;
ALTER TABLE public.orphan_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY orphan_questions_admin_all ON public.orphan_questions
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 8. messages.chunks_acionados jsonb[] — instrumentação futura do chat edge fn
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS chunks_acionados jsonb[];
CREATE INDEX IF NOT EXISTS messages_chunks_acionados_idx ON public.messages USING gin (chunks_acionados);

-- TRIGGERS de atualizado_em / atualizado_em
CREATE OR REPLACE FUNCTION public._tg_curadoria_v2_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._tg_curadoria_v2_atualizado_em() FROM public, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_golden_chunks_atualizado_em') THEN
    CREATE TRIGGER tg_golden_chunks_atualizado_em BEFORE UPDATE ON public.golden_chunks
      FOR EACH ROW EXECUTE FUNCTION public._tg_curadoria_v2_atualizado_em();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_canary_rollouts_atualizado_em') THEN
    CREATE TRIGGER tg_canary_rollouts_atualizado_em BEFORE UPDATE ON public.canary_rollouts
      FOR EACH ROW EXECUTE FUNCTION public._tg_curadoria_v2_atualizado_em();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_orphan_questions_atualizado_em') THEN
    CREATE TRIGGER tg_orphan_questions_atualizado_em BEFORE UPDATE ON public.orphan_questions
      FOR EACH ROW EXECUTE FUNCTION public._tg_curadoria_v2_atualizado_em();
  END IF;
END $$;

COMMENT ON TABLE public.golden_chunks IS 'Cenários do Golden Set · curadoria v2 · F4. Lista de turns + resultado_esperado pra validar regressão.';
COMMENT ON TABLE public.golden_run_batches IS 'Header de execução do Golden Set. Cada Rodar Tudo cria uma batch.';
COMMENT ON TABLE public.golden_runs IS '1 linha por cenário em cada batch · com resultado obtido + diff pra esperado.';
COMMENT ON TABLE public.golden_calibration IS 'Amostras pra calibrar verificador vs julgamento humano.';
COMMENT ON TABLE public.canary_rollouts IS 'Experimentos canary · curadoria v2 · F4. Cada rollout tem critérios de promoção/rollback automáticos.';
COMMENT ON TABLE public.canary_assignments IS 'Atribuição conversa→variante (canary/control). Determinístico por conversation_id.';
COMMENT ON TABLE public.orphan_questions IS 'Perguntas órfãs já clusterizadas. Cron-cluster-gaps popula a partir de perguntas_sem_resposta.';
COMMENT ON COLUMN public.messages.chunks_acionados IS 'Lista de chunk_ids puxados pelo agente neste turno · alimentado pelo edge chat. Usado em Lab/golden e Uso 30d do SideSheet.';

;

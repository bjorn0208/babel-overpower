
-- Sprint C · Migration 008 · Tags Vivas (3 tabelas)

-- 1) tag_observations — sinal raw
CREATE TABLE IF NOT EXISTS public.tag_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  tag_text text NOT NULL,
  contexto_excerto text NULL,
  fonte text NOT NULL DEFAULT 'agente' CHECK (fonte IN ('agente','admin','cron','user')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tag_observations IS 'Sinal raw: cada vez que uma tag é observada num lead/conversa. Alimenta cron clusterizar-tags.';

CREATE INDEX IF NOT EXISTS idx_tag_observations_lead ON public.tag_observations (tenant_id, lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tag_observations_tag ON public.tag_observations (tenant_id, tag_text);
CREATE INDEX IF NOT EXISTS idx_tag_observations_recentes ON public.tag_observations (tenant_id, criado_em DESC);

ALTER TABLE public.tag_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_all" ON public.tag_observations
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "service_role_all" ON public.tag_observations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2) tag_merge_suggestions — sugestões geradas por cron
CREATE TABLE IF NOT EXISTS public.tag_merge_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag_a text NOT NULL,
  tag_b text NOT NULL,
  similarity numeric(4,3) NOT NULL CHECK (similarity >= 0 AND similarity <= 1),
  suggested_canonical text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  motivo text NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz NULL,
  decided_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT tag_pair_distinct CHECK (tag_a <> tag_b)
);

COMMENT ON TABLE public.tag_merge_suggestions IS 'Sugestões de merge entre tags similares. Cron clusterizar-tags popula. Admin decide via Tags Vivas UI.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_merge_pair_unique
  ON public.tag_merge_suggestions (tenant_id, LEAST(tag_a, tag_b), GREATEST(tag_a, tag_b))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tag_merge_pending
  ON public.tag_merge_suggestions (tenant_id, criado_em DESC)
  WHERE status = 'pending';

ALTER TABLE public.tag_merge_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_all" ON public.tag_merge_suggestions
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "service_role_all" ON public.tag_merge_suggestions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) tag_merge_log — log auditável
CREATE TABLE IF NOT EXISTS public.tag_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag_origem text NOT NULL,
  tag_destino text NOT NULL,
  num_observacoes_movidas int NOT NULL DEFAULT 0,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  origem_suggestion_id uuid NULL REFERENCES public.tag_merge_suggestions(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.tag_merge_log IS 'Log auditável de merges de tags aplicados. Imutável após insert.';

CREATE INDEX IF NOT EXISTS idx_tag_merge_log_recentes
  ON public.tag_merge_log (tenant_id, applied_at DESC);

ALTER TABLE public.tag_merge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.tag_merge_log
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

CREATE POLICY "service_role_all" ON public.tag_merge_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

;

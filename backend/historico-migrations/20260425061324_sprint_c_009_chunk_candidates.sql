
-- Sprint C · Migration 009 · chunk_candidates + tag_candidates + trigger anti-N=1

-- 1) chunk_candidates
CREATE TABLE IF NOT EXISTS public.chunk_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NULL REFERENCES public.conversations(id) ON DELETE SET NULL,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,

  excerto text NOT NULL,
  contexto text NULL,
  tipo_sugerido text NULL,
  categoria_sugerida text NULL,

  num_leads_independentes int NOT NULL DEFAULT 1,
  evidencia_lead_ids uuid[] NOT NULL DEFAULT '{}',

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','promoted')),
  motivo_rejeicao text NULL,
  promoted_chunk_id uuid NULL,
  promoted_chunk_table text NULL CHECK (promoted_chunk_table IS NULL OR promoted_chunk_table IN ('knowledge_chunks','behavior_chunks','trigger_chunks','human_chunks','variation_chunks','meta_chunks')),

  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz NULL,
  decided_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.chunk_candidates IS 'Excertos de conversa candidatos a virar chunk RAG. Promovidos quando N>=5 leads independentes (D5).';
COMMENT ON COLUMN public.chunk_candidates.evidencia_lead_ids IS 'Array de lead_id que evidenciam esse padrão. num_leads_independentes = cardinalidade distinct.';

CREATE INDEX IF NOT EXISTS idx_chunk_candidates_pending
  ON public.chunk_candidates (tenant_id, criado_em DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_chunk_candidates_promoted_lookup
  ON public.chunk_candidates (tenant_id, promoted_chunk_id)
  WHERE promoted_chunk_id IS NOT NULL;

ALTER TABLE public.chunk_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_all" ON public.chunk_candidates
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "service_role_all" ON public.chunk_candidates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_set_updated_at_chunk_candidates
  BEFORE UPDATE ON public.chunk_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) tag_candidates
CREATE TABLE IF NOT EXISTS public.tag_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag_text text NOT NULL,

  num_observacoes int NOT NULL DEFAULT 1,
  num_leads_independentes int NOT NULL DEFAULT 1,
  evidencia_lead_ids uuid[] NOT NULL DEFAULT '{}',

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','promoted')),
  promoted_at timestamptz NULL,

  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_candidates_unique_per_tenant
  ON public.tag_candidates (tenant_id, tag_text);

CREATE INDEX IF NOT EXISTS idx_tag_candidates_pending
  ON public.tag_candidates (tenant_id, num_leads_independentes DESC)
  WHERE status = 'pending';

ALTER TABLE public.tag_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_all" ON public.tag_candidates
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "service_role_all" ON public.tag_candidates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_set_updated_at_tag_candidates
  BEFORE UPDATE ON public.tag_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Trigger anti-N=1 (chunk_candidates)
CREATE OR REPLACE FUNCTION public.trg_anti_n1_chunk_candidates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Bloqueia approved/promoted se N < 5
  IF NEW.status IN ('approved','promoted') AND OLD.status NOT IN ('approved','promoted') THEN
    IF NEW.num_leads_independentes < 5 THEN
      RAISE EXCEPTION 'chunk_candidate %: anti-N=1 bloqueia promoção — num_leads_independentes=% (mínimo: 5). D5 do Plano Execução v2.',
        NEW.id, NEW.num_leads_independentes
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_anti_n1_chunk_candidates
  BEFORE UPDATE ON public.chunk_candidates
  FOR EACH ROW EXECUTE FUNCTION public.trg_anti_n1_chunk_candidates();

-- 4) Trigger anti-N=1 (tag_candidates) — mesmo princípio
CREATE OR REPLACE FUNCTION public.trg_anti_n1_tag_candidates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('approved','promoted') AND OLD.status NOT IN ('approved','promoted') THEN
    IF NEW.num_leads_independentes < 5 THEN
      RAISE EXCEPTION 'tag_candidate %: anti-N=1 bloqueia promoção — num_leads_independentes=% (mínimo: 5).',
        NEW.id, NEW.num_leads_independentes
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_anti_n1_tag_candidates
  BEFORE UPDATE ON public.tag_candidates
  FOR EACH ROW EXECUTE FUNCTION public.trg_anti_n1_tag_candidates();

;

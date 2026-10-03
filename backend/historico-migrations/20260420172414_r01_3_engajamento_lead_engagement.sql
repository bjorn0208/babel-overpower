
-- UP: r01_3_engajamento_lead_engagement
-- Wave 0 / R01.3 — Engajamento snapshot + tabela lead_engagement (Motor Vivo)

-- ─── Parte A: coluna engajamento_snapshot em conversations ───────────────────
-- JSONB com estrutura agregada (NÃO array cumulativo) para evitar inflação.
-- Cap de 20 turnos aplicado pela aplicação no write.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS engajamento_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.conversations.engajamento_snapshot IS
  'Array rolling de até 20 snapshots de engajamento por turno: '
  '[{turno, velocidade_resposta_s, comprimento_msg, ts}]. '
  'Aplicação deve truncar a 20 no write (não cresce ilimitado). '
  'Adicionado em R01.3 — Motor Vivo.';

-- ─── Parte B: tabela lead_engagement ─────────────────────────────────────────
-- Engajamento cross-conversa agregado por lead. 1 row por lead (UNIQUE lead_id).
-- Atualizado via UPSERT pelo extract-lead-facts (async pós-turno).

CREATE TABLE IF NOT EXISTS public.lead_engagement (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id           uuid        NOT NULL,
  nivel               text        NOT NULL DEFAULT 'morno'
                                  CHECK (nivel IN ('frio','morno','quente')),
  score               numeric(3,2) NOT NULL DEFAULT 0.5
                                  CHECK (score >= 0 AND score <= 1),
  velocidade_media_s  integer,
  comprimento_medio   integer,
  conversas_count     integer     NOT NULL DEFAULT 0,
  ultima_atualizacao  timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);

COMMENT ON TABLE public.lead_engagement IS
  'Perfil de engajamento cross-conversa por lead (R01.3 — Motor Vivo). '
  '1 row por lead (UNIQUE lead_id). Atualizado via UPSERT assíncrono pós-turno. '
  'score 0..1: frio < 0.3 | morno 0.3-0.7 | quente > 0.7.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_lead_engagement_tenant_id
  ON public.lead_engagement (tenant_id);

-- idx_lead_engagement_lead_id já coberto pelo UNIQUE constraint

CREATE INDEX IF NOT EXISTS idx_lead_engagement_nivel_atualizacao
  ON public.lead_engagement (nivel, ultima_atualizacao DESC);

-- Trigger updated_at
CREATE TRIGGER trg_lead_engagement_updated_at
  BEFORE UPDATE ON public.lead_engagement
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS em lead_engagement ───────────────────────────────────────────────────
ALTER TABLE public.lead_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagement_tenant_all" ON public.lead_engagement
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

CREATE POLICY "engagement_service_all" ON public.lead_engagement
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

;

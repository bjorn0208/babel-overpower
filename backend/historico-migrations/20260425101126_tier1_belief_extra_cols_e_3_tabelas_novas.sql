-- =============================================================
-- TIER 1 — TRIPÉ DO PLANO AGENTE VIVO
-- (1) 3 colunas em conversation_belief
-- (2) reflection_log (Reflexion loop A2)
-- (3) procedural_chunks (CoALA 5ª camada B10)
-- (4) lead_pattern (Campanha Semântica §15 proposta-final)
-- =============================================================

-- ---------- (1) conversation_belief ----------
ALTER TABLE public.conversation_belief
  ADD COLUMN IF NOT EXISTS proxima_intencao jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS proximo_passo_previsto text,
  ADD COLUMN IF NOT EXISTS estilo_lead text;

COMMENT ON COLUMN public.conversation_belief.proxima_intencao IS
  'Predição da próxima intenção do lead (objecao_preco|objecao_prazo|objecao_confianca|fechamento|sumir). Alimenta A3 Predictive pre-objection do planejador.';
COMMENT ON COLUMN public.conversation_belief.proximo_passo_previsto IS
  'Texto livre — o que o agente PLANEJA fazer no próximo turno. Aparece na Ficha Transparente do admin (Sprint D).';
COMMENT ON COLUMN public.conversation_belief.estilo_lead IS
  'formal|informal|misto — detectado por LSM e usado no Ajuste 4 espelhamento_sutil.';

-- ---------- (2) reflection_log ----------
CREATE TABLE IF NOT EXISTS public.reflection_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  turno_numero integer,
  motivo_falha text NOT NULL,
  detalhe_verificador jsonb DEFAULT '{}'::jsonb,
  resposta_original text,
  licao_gerada text,
  meta_chunk_criado_id uuid REFERENCES public.meta_chunks(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'gerado' CHECK (status = ANY (ARRAY['gerado','aprovado','rejeitado','aplicado'])),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_reflection_log_conversation ON public.reflection_log(conversation_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reflection_log_tenant ON public.reflection_log(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reflection_log_meta_chunk ON public.reflection_log(meta_chunk_criado_id) WHERE meta_chunk_criado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reflection_log_status ON public.reflection_log(status) WHERE deleted_at IS NULL;

ALTER TABLE public.reflection_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_read_reflection_log ON public.reflection_log
  FOR SELECT TO authenticated
  USING (tenant_id = (select auth.uid()) AND deleted_at IS NULL);

CREATE POLICY service_role_all_reflection_log ON public.reflection_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.reflection_log IS
  'A2 Reflexion loop — quando verificador rejeita turno, edge fn gera lição em texto via LLM barato. Lição vira meta_chunk com origem=reflexao_runtime, stability_tier=experimental.';

-- ---------- (3) procedural_chunks ----------
CREATE TABLE IF NOT EXISTS public.procedural_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo text NOT NULL CHECK (escopo = ANY (ARRAY['global','nicho','tenant'])),
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome_procedimento text NOT NULL,
  passos jsonb NOT NULL DEFAULT '[]'::jsonb,
  citacao_kb text,
  imutavel boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  prioridade integer NOT NULL DEFAULT 500,
  vezes_usado integer NOT NULL DEFAULT 0,
  versao integer NOT NULL DEFAULT 1,
  embedding extensions.halfvec(1536),
  embedding_status text NOT NULL DEFAULT 'pending' CHECK (embedding_status = ANY (ARRAY['pending','processing','ready','failed'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (
    (escopo = 'global' AND nicho_id IS NULL AND tenant_id IS NULL) OR
    (escopo = 'nicho' AND nicho_id IS NOT NULL AND tenant_id IS NULL) OR
    (escopo = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_procedural_chunks_escopo ON public.procedural_chunks(escopo) WHERE deleted_at IS NULL AND ativo = true;
CREATE INDEX IF NOT EXISTS idx_procedural_chunks_nicho ON public.procedural_chunks(nicho_id) WHERE nicho_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procedural_chunks_tenant ON public.procedural_chunks(tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE public.procedural_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_read_procedural_chunks ON public.procedural_chunks
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND ativo = true
    AND (escopo = 'global' OR tenant_id = (select auth.uid()))
  );

CREATE POLICY service_role_all_procedural_chunks ON public.procedural_chunks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_enqueue_embedding_procedural
  BEFORE INSERT OR UPDATE OF passos ON public.procedural_chunks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

CREATE TRIGGER trg_set_updated_at_procedural
  BEFORE UPDATE ON public.procedural_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.procedural_chunks IS
  'CoALA 5ª camada — Procedural memory. Scripts COMO fazer (fechar contrato em 3 passos, recuperar lead frio, etc). passos jsonb array de objetos {ordem, acao, condicao}.';

-- ---------- (4) lead_pattern ----------
CREATE TABLE IF NOT EXISTS public.lead_pattern (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  padrao text NOT NULL,
  categoria text NOT NULL CHECK (categoria = ANY (ARRAY['comportamental','demografico','financeiro','engajamento','outcome'])),
  confianca numeric(3,2) NOT NULL DEFAULT 0.50 CHECK (confianca >= 0 AND confianca <= 1),
  evidencia_turnos integer[] DEFAULT ARRAY[]::integer[],
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_lead_pattern_lead ON public.lead_pattern(lead_id) WHERE deleted_at IS NULL AND ativo = true;
CREATE INDEX IF NOT EXISTS idx_lead_pattern_tenant ON public.lead_pattern(tenant_id) WHERE deleted_at IS NULL AND ativo = true;
CREATE INDEX IF NOT EXISTS idx_lead_pattern_categoria ON public.lead_pattern(categoria) WHERE deleted_at IS NULL AND ativo = true;

ALTER TABLE public.lead_pattern ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_read_lead_pattern ON public.lead_pattern
  FOR SELECT TO authenticated
  USING (tenant_id = (select auth.uid()) AND deleted_at IS NULL);

CREATE POLICY service_role_all_lead_pattern ON public.lead_pattern
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.lead_pattern IS
  'Padrões comportamentais detectados sobre o lead — alimenta wizard Campanha Semântica via buscar_leads_similares (proposta-final §15).';
;

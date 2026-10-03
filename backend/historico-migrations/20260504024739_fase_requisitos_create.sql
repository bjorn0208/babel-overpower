-- Onda 1 / Projeto: Fase x Requisitos Semanticos
-- Migration: fase_requisitos_create
-- Tabela fase_requisitos: lista declarativa de requisitos por fase.
-- Soft delete via ativo=false. Embedding halfvec(1536) via Cohere embed-v4.0.
-- RLS + 4 policies na mesma migration (Inviolavel 4).

CREATE TABLE IF NOT EXISTS public.fase_requisitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fase text NOT NULL CHECK (fase IN ('saudacao','qualificacao','apresentacao','negociacao','fechado')),
  ordem integer NOT NULL DEFAULT 0,
  descricao_curta text NOT NULL,
  descricao_semantica text NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT false,
  evidencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  escopo text NOT NULL DEFAULT 'global'
    CHECK (escopo IN ('global','nicho','tenant','produto','agente')),
  nicho_id  uuid REFERENCES public.nichos(id)     ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.profiles(id)   ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id)  ON DELETE CASCADE,
  agent_id  uuid REFERENCES public.user_agents(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  embedding halfvec(1536),
  embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending','processing','ready','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fase_requisitos IS
'Requisitos declarativos por fase do agente. Substituem o guard de slots textuais. Avaliados com evidencias compostas em OR. Embedding via Cohere embed-v4.0 para evidencia sinal_semantico.';

COMMENT ON COLUMN public.fase_requisitos.fase IS
'Fase da conversa: saudacao | qualificacao | apresentacao | negociacao | fechado';

COMMENT ON COLUMN public.fase_requisitos.descricao_semantica IS
'Texto embedado pelo gerar-embedding via Cohere. Usado na evidencia sinal_semantico para medir similaridade com as ultimas mensagens da conversa.';

COMMENT ON COLUMN public.fase_requisitos.evidencias IS
'Array de evidencias em OR. Tipos: captura (dadosMerged[alvo] preenchido), flag (dadosMerged[alvo]=sim), trigger (acao disparada na conversa), sinal_semantico (similaridade Cohere com descricao_semantica).';

COMMENT ON COLUMN public.fase_requisitos.obrigatorio IS
'Se true: trava avanco de fase ate cumprido. Se false: gera hint para o agente sem bloquear.';

COMMENT ON COLUMN public.fase_requisitos.ativo IS
'Soft delete: false = inativo. Nunca deletar fisicamente — preservar para auditoria.';

COMMENT ON COLUMN public.fase_requisitos.embedding_status IS
'Status do pipeline Cohere: pending (aguardando) | processing (em andamento) | ready (pronto) | failed (erro).';

CREATE INDEX IF NOT EXISTS fase_requisitos_lookup_idx
  ON public.fase_requisitos (escopo, fase, ativo);

CREATE INDEX IF NOT EXISTS fase_requisitos_tenant_idx
  ON public.fase_requisitos (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fase_requisitos_agent_idx
  ON public.fase_requisitos (agent_id) WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fase_requisitos_nicho_idx
  ON public.fase_requisitos (nicho_id) WHERE nicho_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fase_requisitos_produto_idx
  ON public.fase_requisitos (produto_id) WHERE produto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fase_requisitos_embedding_hnsw
  ON public.fase_requisitos USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.fase_requisitos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_fase_requisitos"
  ON public.fase_requisitos
  FOR SELECT TO authenticated
  USING (ativo = true);

CREATE POLICY "tenant_owns_fase_requisitos"
  ON public.fase_requisitos
  FOR ALL TO authenticated
  USING (escopo = 'tenant' AND tenant_id = (select auth.uid()))
  WITH CHECK (escopo = 'tenant' AND tenant_id = (select auth.uid()));

CREATE POLICY "agent_owner_fase_requisitos"
  ON public.fase_requisitos
  FOR ALL TO authenticated
  USING (
    escopo = 'agente' AND agent_id IN (
      SELECT id FROM public.user_agents WHERE user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    escopo = 'agente' AND agent_id IN (
      SELECT id FROM public.user_agents WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "service_role_all_fase_requisitos"
  ON public.fase_requisitos
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
;

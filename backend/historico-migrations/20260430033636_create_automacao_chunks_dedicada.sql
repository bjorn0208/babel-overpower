-- DEC-017 · separação correta de responsabilidades:
-- trigger_chunks = ações disparadas por FALA/COMPORTAMENTO do lead
-- automacao_chunks = chunks consultivos · LLM puxa via rerank quando lead PAROU
--                    de interagir (silêncio, contrato sem assinar, comprovante
--                    não enviado, despedida sem data) · ensina ângulo+assunto+tom.

CREATE TABLE IF NOT EXISTS public.automacao_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text NOT NULL,
  escopo text NOT NULL DEFAULT 'global' CHECK (escopo IN ('global','nicho','tenant')),
  nicho_id uuid REFERENCES public.nichos(id),
  tenant_id uuid REFERENCES public.profiles(id),
  cenario text NOT NULL CHECK (cenario IN (
    'silencio_pos_fase',
    'nao_assinou_contrato',
    'nao_enviou_comprovante',
    'nao_respondeu_proposta',
    'despedida_sem_data',
    'qualquer'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  condicao_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  embedding vector(1024),
  embedding_status text NOT NULL DEFAULT 'pending' CHECK (
    embedding_status IN ('pending','processing','ready','failed')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automacao_chunks_cenario_idx
  ON public.automacao_chunks (cenario, ativo);
CREATE INDEX IF NOT EXISTS automacao_chunks_escopo_tenant_idx
  ON public.automacao_chunks (escopo, tenant_id);
CREATE INDEX IF NOT EXISTS automacao_chunks_escopo_nicho_idx
  ON public.automacao_chunks (escopo, nicho_id);
CREATE INDEX IF NOT EXISTS automacao_chunks_embedding_idx
  ON public.automacao_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.automacao_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY automacao_chunks_admin_all
  ON public.automacao_chunks
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY automacao_chunks_tenant_read
  ON public.automacao_chunks
  FOR SELECT TO authenticated
  USING (
    escopo = 'global'
    OR (escopo = 'nicho' AND nicho_id = (
      SELECT p.nicho_id FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
    ))
    OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
  );

COMMENT ON TABLE public.automacao_chunks IS
  'RAG dedicado das automações semânticas (DEC-017). Chunks consultivos puxados
   via rerank pelo LLM no momento de planejar retomada de conversa parada.
   DIFERENTE de trigger_chunks (que dispara em resposta a fala explícita do lead).';
COMMENT ON COLUMN public.automacao_chunks.descricao IS
  'Texto humano descritivo embeddado para semantic search.';
COMMENT ON COLUMN public.automacao_chunks.cenario IS
  'Tipo de não-ação que o chunk orienta. ''qualquer'' aplica a todos.';
COMMENT ON COLUMN public.automacao_chunks.payload IS
  'Estratégia: angulo (kebab) · assunto (string) · tom (kebab) · exemplos_abertura[] · evitar[].';
COMMENT ON COLUMN public.automacao_chunks.condicao_extra IS
  'Filtros adicionais: fase[] · objecao_detectada[] · engagement_min · pipeline_stage[].';
;

-- Tabela de rastreio de invocações de tool — Camada 2 do tripé do plano agente vivo.
-- Cada vez que tool-runtime aceita acao_sugerida, valida guard via Zod, e decide executar:
-- registra aqui ANTES do side-effect real (audit trail).

CREATE TABLE IF NOT EXISTS public.tool_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  input_validado jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_chunk_id uuid REFERENCES public.meta_chunks(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'registrada' CHECK (status = ANY (ARRAY['registrada','executada','falhou','cancelada'])),
  motivo text,
  resultado jsonb DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  executado_em timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_conv ON public.tool_invocations(conversation_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tool_invocations_tenant ON public.tool_invocations(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tool_invocations_tool ON public.tool_invocations(tool_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tool_invocations_status ON public.tool_invocations(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tool_invocations_meta ON public.tool_invocations(meta_chunk_id) WHERE meta_chunk_id IS NOT NULL;

ALTER TABLE public.tool_invocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_read_tool_invocations ON public.tool_invocations
  FOR SELECT TO authenticated
  USING (tenant_id = (select auth.uid()) AND deleted_at IS NULL);

CREATE POLICY service_role_all_tool_invocations ON public.tool_invocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tool_invocations IS
  'Camada 2 do tripé do plano agente vivo — registro de toda invocação de tool feita pelo tool-runtime. Audit trail antes do side-effect real. status=registrada por padrão (modo seguro), executada quando confirma side-effect.';
;

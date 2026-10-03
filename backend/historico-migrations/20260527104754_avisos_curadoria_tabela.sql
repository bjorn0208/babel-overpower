
-- Tabela avisos_curadoria — recados/alertas que o cargo Curadoria (LLM autonomo)
-- ou um curador humano deixa pra Theus dentro do app Curadoria.
-- RAG-FIRST friendly: armazena vetor_semantico do conteudo pra busca/dedupe.

CREATE TABLE IF NOT EXISTS public.avisos_curadoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_tipo text NOT NULL CHECK (autor_tipo IN ('cargo','humano')),
  cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  severidade text NOT NULL DEFAULT 'info' CHECK (severidade IN ('info','atencao','critico','sugestao')),
  titulo text NOT NULL,
  mensagem text NOT NULL,
  contexto_aba text,
  bloco_origem_tabela text,
  bloco_origem_id uuid,
  acao_sugerida_tipo text,
  acao_sugerida_payload jsonb,
  escopo text NOT NULL DEFAULT 'global' CHECK (escopo IN ('global','nicho','tenant')),
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  conteudo_busca tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(mensagem, '')), 'B')
  ) STORED,
  vetor_semantico halfvec(1536),
  embedding_status text NOT NULL DEFAULT 'pendente' CHECK (embedding_status IN ('pendente','pronto','falhou')),
  lido_em timestamptz,
  lido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  arquivado_em timestamptz,
  arquivado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT escopo_consistente CHECK (
    (escopo='global' AND nicho_id IS NULL AND tenant_id IS NULL) OR
    (escopo='nicho'  AND nicho_id IS NOT NULL AND tenant_id IS NULL) OR
    (escopo='tenant' AND tenant_id IS NOT NULL)
  ),
  CONSTRAINT autor_consistente CHECK (
    (autor_tipo='cargo' AND cargo_id IS NOT NULL) OR
    (autor_tipo='humano' AND criado_por IS NOT NULL)
  )
);

COMMENT ON TABLE public.avisos_curadoria IS
'Recados/alertas do cargo Curadoria (LLM autonomo) ou curador humano. Aparece como aba inicial no app Curadoria. RAG-FIRST friendly (FTS + vetor_semantico pra dedupe/busca semantica).';

-- Indices
CREATE INDEX IF NOT EXISTS idx_avisos_curadoria_nao_lidos
  ON public.avisos_curadoria (criado_em DESC)
  WHERE lido_em IS NULL AND arquivado_em IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_avisos_curadoria_escopo
  ON public.avisos_curadoria (escopo, criado_em DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_avisos_curadoria_tenant
  ON public.avisos_curadoria (tenant_id, criado_em DESC)
  WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_avisos_curadoria_nicho
  ON public.avisos_curadoria (nicho_id, criado_em DESC)
  WHERE nicho_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_avisos_curadoria_busca
  ON public.avisos_curadoria USING gin (conteudo_busca);

CREATE INDEX IF NOT EXISTS idx_avisos_curadoria_vetor
  ON public.avisos_curadoria USING hnsw (vetor_semantico halfvec_cosine_ops)
  WHERE embedding_status = 'pronto' AND deleted_at IS NULL;

-- Trigger atualizado_em
CREATE OR REPLACE FUNCTION public.tg_avisos_curadoria_atualizar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_avisos_curadoria_atualizar ON public.avisos_curadoria;
CREATE TRIGGER trg_avisos_curadoria_atualizar
  BEFORE UPDATE ON public.avisos_curadoria
  FOR EACH ROW EXECUTE FUNCTION public.tg_avisos_curadoria_atualizar();

-- RLS
ALTER TABLE public.avisos_curadoria ENABLE ROW LEVEL SECURITY;

-- platform_admin ve tudo
CREATE POLICY "avisos_curadoria_admin_full" ON public.avisos_curadoria
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND system_role = 'platform_admin')
    AND deleted_at IS NULL
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND system_role = 'platform_admin')
  );

-- tenant ve avisos escopo='tenant' do proprio tenant_id
CREATE POLICY "avisos_curadoria_tenant_proprio" ON public.avisos_curadoria
  FOR SELECT TO authenticated
  USING (
    escopo = 'tenant'
    AND tenant_id = (select auth.uid())
    AND deleted_at IS NULL
  );

-- tenant marca como lido seus proprios avisos
CREATE POLICY "avisos_curadoria_tenant_marca_lido" ON public.avisos_curadoria
  FOR UPDATE TO authenticated
  USING (escopo = 'tenant' AND tenant_id = (select auth.uid()) AND deleted_at IS NULL)
  WITH CHECK (escopo = 'tenant' AND tenant_id = (select auth.uid()));

;

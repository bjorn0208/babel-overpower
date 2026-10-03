CREATE TABLE IF NOT EXISTS public.meta_chunks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo            text NOT NULL CHECK (escopo IN ('global','nicho','tenant')),
  nicho_id          uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag               text NOT NULL CHECK (tag IN ('planejar_turno','verificar_saida','escolher_ferramenta')),
  corpo             text NOT NULL,
  citacao_kb        text,
  imutavel          boolean NOT NULL DEFAULT false,
  ativo             boolean NOT NULL DEFAULT true,
  prioridade        int NOT NULL DEFAULT 500,
  tags              text[] NOT NULL DEFAULT '{}',
  origem            text NOT NULL DEFAULT 'seed',
  vezes_usado       int NOT NULL DEFAULT 0,
  versao            int NOT NULL DEFAULT 1,
  embedding         extensions.halfvec(1536),
  embedding_status  text NOT NULL DEFAULT 'pending'
                    CHECK (embedding_status IN ('pending','processing','done','failed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_chunks_escopo_consistencia CHECK (
    (escopo = 'global' AND nicho_id IS NULL AND tenant_id IS NULL)
    OR (escopo = 'nicho'  AND nicho_id IS NOT NULL AND tenant_id IS NULL)
    OR (escopo = 'tenant' AND tenant_id IS NOT NULL AND nicho_id IS NULL)
  )
);

COMMENT ON TABLE public.meta_chunks IS
  'Sprint B · ETAPA 2 · Plano Execucao.md v2. Meta-chunks que ditam comportamento do agente. Tags: planejar_turno (estratégia de RAG/turno), verificar_saida (sanity check pós-LLM), escolher_ferramenta (heurística de tool calling).';

CREATE TABLE IF NOT EXISTS public.meta_chunks_tenant_overrides (
  chunk_id    uuid NOT NULL REFERENCES public.meta_chunks(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo       boolean NOT NULL DEFAULT false,
  motivo      text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, tenant_id)
);

COMMENT ON TABLE public.meta_chunks_tenant_overrides IS
  'Tenant desliga meta_chunk global/nicho específico. RLS de meta_chunks honra via NOT EXISTS. Padrão idêntico ao das 5 gavetas (FASE 0 — commit b2c0954).';

CREATE INDEX IF NOT EXISTS meta_chunks_escopo_tag_ativo_idx
  ON public.meta_chunks (escopo, tag) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS meta_chunks_nicho_id_idx
  ON public.meta_chunks (nicho_id) WHERE nicho_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meta_chunks_tenant_id_idx
  ON public.meta_chunks (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meta_chunks_tags_gin_idx
  ON public.meta_chunks USING gin (tags);

CREATE INDEX IF NOT EXISTS meta_chunks_overrides_tenant_idx
  ON public.meta_chunks_tenant_overrides (tenant_id);

DROP TRIGGER IF EXISTS trg_set_updated_at_meta_chunks ON public.meta_chunks;
CREATE TRIGGER trg_set_updated_at_meta_chunks
  BEFORE UPDATE ON public.meta_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_embedding_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text;
  v_new jsonb := to_jsonb(NEW);
BEGIN
  v_text := CASE TG_TABLE_NAME
    WHEN 'behavior_chunks'  THEN coalesce(v_new->>'situacao_descricao','') || E'\n' || coalesce(v_new->>'instrucao','')
    WHEN 'trigger_chunks'   THEN v_new->>'exemplo_frase'
    WHEN 'human_chunks'     THEN v_new->>'contexto_uso'
    WHEN 'lead_memory'      THEN v_new->>'fato'
    WHEN 'variation_chunks' THEN v_new->>'instrucao'
    WHEN 'knowledge_chunks' THEN coalesce(v_new->>'title','') || E'\n' || coalesce(v_new->>'content','')
    WHEN 'meta_chunks'      THEN v_new->>'corpo'
    ELSE NULL
  END;

  IF v_text IS NULL OR length(trim(v_text)) = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pgmq.send('embedding_jobs', jsonb_build_object(
    'table', TG_TABLE_NAME,
    'row_id', NEW.id,
    'text', v_text
  ));

  NEW.embedding_status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_embedding_meta ON public.meta_chunks;
CREATE TRIGGER trg_enqueue_embedding_meta
  BEFORE INSERT OR UPDATE OF corpo ON public.meta_chunks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

ALTER TABLE public.meta_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_chunks_tenant_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS srv_meta_chunks ON public.meta_chunks;
CREATE POLICY srv_meta_chunks ON public.meta_chunks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_meta_chunks ON public.meta_chunks;
CREATE POLICY admin_all_meta_chunks ON public.meta_chunks
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS tenant_read_meta_chunks ON public.meta_chunks;
CREATE POLICY tenant_read_meta_chunks ON public.meta_chunks
  FOR SELECT TO authenticated
  USING (
    ativo = true AND (
      escopo = 'global'
      OR (
        escopo = 'nicho'
        AND nicho_id = (
          SELECT p.nicho_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
        )
      )
      OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.meta_chunks_tenant_overrides o
      WHERE o.chunk_id = meta_chunks.id
        AND o.tenant_id = (SELECT auth.uid())
        AND o.ativo = false
    )
  );

DROP POLICY IF EXISTS tenant_write_meta_chunks ON public.meta_chunks;
CREATE POLICY tenant_write_meta_chunks ON public.meta_chunks
  FOR INSERT TO authenticated
  WITH CHECK (
    escopo = 'tenant'
    AND tenant_id = (SELECT auth.uid())
    AND imutavel = false
  );

DROP POLICY IF EXISTS tenant_update_own_meta_chunks ON public.meta_chunks;
CREATE POLICY tenant_update_own_meta_chunks ON public.meta_chunks
  FOR UPDATE TO authenticated
  USING (
    escopo = 'tenant'
    AND tenant_id = (SELECT auth.uid())
    AND imutavel = false
  )
  WITH CHECK (
    escopo = 'tenant'
    AND tenant_id = (SELECT auth.uid())
    AND imutavel = false
  );

DROP POLICY IF EXISTS tenant_delete_own_meta_chunks ON public.meta_chunks;
CREATE POLICY tenant_delete_own_meta_chunks ON public.meta_chunks
  FOR DELETE TO authenticated
  USING (
    escopo = 'tenant'
    AND tenant_id = (SELECT auth.uid())
    AND imutavel = false
  );

DROP POLICY IF EXISTS srv_meta_overrides ON public.meta_chunks_tenant_overrides;
CREATE POLICY srv_meta_overrides ON public.meta_chunks_tenant_overrides
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_all_meta_overrides ON public.meta_chunks_tenant_overrides;
CREATE POLICY tenant_all_meta_overrides ON public.meta_chunks_tenant_overrides
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));
;

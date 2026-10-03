-- Documento financeiro bruto (comprovante, extrato) enviado pelo dono ao cargo Financeiro.
-- 1 documento → N movimentos_financeiros. hash_arquivo = anti-duplicata do arquivo.
CREATE TABLE IF NOT EXISTS public.documentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'comprovante' CHECK (tipo IN ('comprovante','extrato','outro')),
  storage_path text,
  hash_arquivo text,
  dados_extraidos jsonb NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.documentos_financeiros IS 'Arquivo bruto (comprovante/extrato) recebido pelo assistente financeiro; dados_extraidos = JSON da leitura via Gemini.';

CREATE UNIQUE INDEX IF NOT EXISTS uk_documentos_financeiros_hash
  ON public.documentos_financeiros (tenant_id, hash_arquivo)
  WHERE hash_arquivo IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_financeiros_tenant
  ON public.documentos_financeiros (tenant_id, criado_em DESC) WHERE deleted_at IS NULL;

ALTER TABLE public.documentos_financeiros ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'documentos_financeiros_tenant_all') THEN
    CREATE POLICY "documentos_financeiros_tenant_all" ON public.documentos_financeiros
      FOR ALL TO authenticated
      USING (tenant_id = (select auth.uid()))
      WITH CHECK (tenant_id = (select auth.uid()));
  END IF;
END $$;

-- Bucket privado pros arquivos (path: {tenant_id}/{documento_id}.{ext})
INSERT INTO storage.buckets (id, name, public)
VALUES ('financeiro', 'financeiro', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'financeiro_storage_dono_select') THEN
    CREATE POLICY "financeiro_storage_dono_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'financeiro' AND (storage.foldername(name))[1] = (select auth.uid())::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'financeiro_storage_dono_insert') THEN
    CREATE POLICY "financeiro_storage_dono_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'financeiro' AND (storage.foldername(name))[1] = (select auth.uid())::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'financeiro_storage_dono_delete') THEN
    CREATE POLICY "financeiro_storage_dono_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'financeiro' AND (storage.foldername(name))[1] = (select auth.uid())::text);
  END IF;
END $$;
;

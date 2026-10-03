-- Arquivos do app "Textos" — editor de documentos do user. Cada row = 1 arquivo.
-- conteudo guarda HTML (saída do contentEditable). Soft delete via deleted_at.

CREATE TABLE IF NOT EXISTS public.arquivos_textos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  titulo text NOT NULL DEFAULT 'Sem título',
  conteudo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT arquivos_textos_pkey PRIMARY KEY (id),
  CONSTRAINT arquivos_textos_user_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_arquivos_textos_user_ativo
  ON public.arquivos_textos (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- updated_at automático
CREATE OR REPLACE FUNCTION public.tg_arquivos_textos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arquivos_textos_updated_at ON public.arquivos_textos;
CREATE TRIGGER trg_arquivos_textos_updated_at
  BEFORE UPDATE ON public.arquivos_textos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_arquivos_textos_updated_at();

-- RLS
ALTER TABLE public.arquivos_textos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_proprios_textos" ON public.arquivos_textos;
CREATE POLICY "user_read_proprios_textos" ON public.arquivos_textos
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "user_insert_proprios_textos" ON public.arquivos_textos;
CREATE POLICY "user_insert_proprios_textos" ON public.arquivos_textos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_update_proprios_textos" ON public.arquivos_textos;
CREATE POLICY "user_update_proprios_textos" ON public.arquivos_textos
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_delete_proprios_textos" ON public.arquivos_textos;
CREATE POLICY "user_delete_proprios_textos" ON public.arquivos_textos
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "service_role_full_textos" ON public.arquivos_textos;
CREATE POLICY "service_role_full_textos" ON public.arquivos_textos
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.arquivos_textos IS 'Arquivos do app "Textos" — editor visual estilo WordPress (design alterado pra proteção de plágio). conteudo = HTML do contentEditable. Soft delete via deleted_at.';

;

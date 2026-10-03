CREATE TABLE IF NOT EXISTS public.admin_ia_documentos_ingeridos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('md','txt','pdf','audio_transcricao')),
  conteudo text NOT NULL,
  ingerido_por uuid REFERENCES auth.users(id),
  ingerido_em timestamptz NOT NULL DEFAULT now(),
  propostas_geradas uuid[] DEFAULT ARRAY[]::uuid[],
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','processando','finalizado','erro')),
  erro_mensagem text,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.admin_ia_documentos_ingeridos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_ia_docs_admin_all ON public.admin_ia_documentos_ingeridos;
CREATE POLICY admin_ia_docs_admin_all
  ON public.admin_ia_documentos_ingeridos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role='platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role='platform_admin'));

CREATE INDEX IF NOT EXISTS admin_ia_docs_ingerido_em_idx ON public.admin_ia_documentos_ingeridos (ingerido_em DESC);
;

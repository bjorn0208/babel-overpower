-- Instalações de aplicativos por user. 1 row por (user, aplicativo).
-- Insert = user instalou o app. Delete = user desinstalou.
-- Front lê pra filtrar quais slugs do catálogo aparecem no Launchpad/Spotlight do user.

CREATE TABLE IF NOT EXISTS public.aplicativos_instalados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  aplicativo_id uuid NOT NULL,
  aplicativo_slug text NOT NULL,
  instalado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aplicativos_instalados_pkey PRIMARY KEY (id),
  CONSTRAINT aplicativos_instalados_user_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT aplicativos_instalados_aplicativo_fkey
    FOREIGN KEY (aplicativo_id) REFERENCES public.loja_aplicativos(id) ON DELETE CASCADE,
  CONSTRAINT aplicativos_instalados_unique UNIQUE (user_id, aplicativo_id)
);

CREATE INDEX IF NOT EXISTS idx_aplicativos_instalados_user
  ON public.aplicativos_instalados (user_id);

CREATE INDEX IF NOT EXISTS idx_aplicativos_instalados_aplicativo
  ON public.aplicativos_instalados (aplicativo_id);

-- RLS
ALTER TABLE public.aplicativos_instalados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_proprias_instalacoes" ON public.aplicativos_instalados;
CREATE POLICY "user_read_proprias_instalacoes" ON public.aplicativos_instalados
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_insert_proprias_instalacoes" ON public.aplicativos_instalados;
CREATE POLICY "user_insert_proprias_instalacoes" ON public.aplicativos_instalados
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_delete_proprias_instalacoes" ON public.aplicativos_instalados;
CREATE POLICY "user_delete_proprias_instalacoes" ON public.aplicativos_instalados
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "admin_read_instalacoes" ON public.aplicativos_instalados;
CREATE POLICY "admin_read_instalacoes" ON public.aplicativos_instalados
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "service_role_full_instalacoes" ON public.aplicativos_instalados;
CREATE POLICY "service_role_full_instalacoes" ON public.aplicativos_instalados
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.aplicativos_instalados IS 'Instalações de aplicativos por user. Frontend lê pra filtrar quais slugs do catálogo aparecem no Launchpad/Spotlight. UNIQUE(user_id, aplicativo_id) evita instalação duplicada.';

;

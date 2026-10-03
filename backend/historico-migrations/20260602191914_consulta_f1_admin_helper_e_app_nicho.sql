-- App Consulta F1 — helper de admin de plataforma + elo app↔nicho + visibilidade
-- Espelha padrão de loja_aplicativos. Idempotente.

-- 1. Helper: tenant logado é admin da plataforma?
CREATE OR REPLACE FUNCTION public.eh_admin_plataforma()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (select auth.uid()) AND system_role = 'platform_admin'
  );
$$;

-- 2. Elo N:N app↔nicho (regra da exceção: sem linha = global; com linha = restrito ao nicho)
CREATE TABLE IF NOT EXISTS public.aplicativos_nicho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aplicativo_id uuid NOT NULL REFERENCES public.loja_aplicativos(id) ON DELETE CASCADE,
  nicho_id uuid NOT NULL REFERENCES public.nichos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aplicativos_nicho_unique UNIQUE (aplicativo_id, nicho_id)
);
CREATE INDEX IF NOT EXISTS aplicativos_nicho_aplicativo_idx ON public.aplicativos_nicho(aplicativo_id);
CREATE INDEX IF NOT EXISTS aplicativos_nicho_nicho_idx ON public.aplicativos_nicho(nicho_id);

ALTER TABLE public.aplicativos_nicho ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura_aplicativos_nicho" ON public.aplicativos_nicho;
CREATE POLICY "leitura_aplicativos_nicho" ON public.aplicativos_nicho
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_escreve_aplicativos_nicho" ON public.aplicativos_nicho;
CREATE POLICY "admin_escreve_aplicativos_nicho" ON public.aplicativos_nicho
  FOR ALL TO authenticated
  USING (public.eh_admin_plataforma())
  WITH CHECK (public.eh_admin_plataforma());

-- 3. Visibilidade: apps que o tenant logado enxerga (regra da exceção)
CREATE OR REPLACE FUNCTION public.apps_visiveis_para_tenant()
RETURNS SETOF public.loja_aplicativos
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT la.*
  FROM public.loja_aplicativos la
  WHERE la.is_active = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.aplicativos_nicho an WHERE an.aplicativo_id = la.id)
      OR EXISTS (
        SELECT 1
        FROM public.aplicativos_nicho an
        JOIN public.profiles p ON p.id = (select auth.uid())
        WHERE an.aplicativo_id = la.id AND an.nicho_id = p.nicho_id
      )
    );
$$;
;

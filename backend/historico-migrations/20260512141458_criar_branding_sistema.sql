CREATE TABLE IF NOT EXISTS public.branding_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_produto text NOT NULL DEFAULT 'Plataforma',
  nome_curto text NOT NULL DEFAULT 'Plataforma',
  logo_url text,
  favicon_url text,
  cor_fundo text NOT NULL DEFAULT 'oklch(0.16 0.04 280)',
  cor_acento text NOT NULL DEFAULT 'oklch(0.68 0.22 280)',
  cor_acento_secundaria text NOT NULL DEFAULT 'oklch(0.72 0.18 200)',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branding_sistema_ativo_idx
  ON public.branding_sistema (ativo, atualizado_em DESC);

ALTER TABLE public.branding_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branding_sistema_leitura_autenticada ON public.branding_sistema;
CREATE POLICY branding_sistema_leitura_autenticada
  ON public.branding_sistema FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS branding_sistema_leitura_publica ON public.branding_sistema;
CREATE POLICY branding_sistema_leitura_publica
  ON public.branding_sistema FOR SELECT TO anon
  USING (ativo = true);

DROP POLICY IF EXISTS branding_sistema_escrita_admin ON public.branding_sistema;
CREATE POLICY branding_sistema_escrita_admin
  ON public.branding_sistema FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'
  ));

INSERT INTO public.branding_sistema (nome_produto, nome_curto, cor_fundo, cor_acento, cor_acento_secundaria, ativo)
SELECT 'Plataforma Limpa', 'Plataforma', 'oklch(0.16 0.04 280)', 'oklch(0.68 0.22 280)', 'oklch(0.72 0.18 200)', true
WHERE NOT EXISTS (SELECT 1 FROM public.branding_sistema WHERE ativo = true);

COMMENT ON TABLE public.branding_sistema IS 'White-label: nome/logo/cores que o admin pode customizar. Lido por useBranding no frontend.';
;

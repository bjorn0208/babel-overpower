-- Catálogo de aplicativos instaláveis da plataforma.
-- Admin gerencia via app "Aplicativos". User consome via aba "Aplicativos" do app Loja.
-- preco_mensal NULL = grátis. Caso pago, usa fluxo PIX + pedidos_compra igual planos.

CREATE TABLE IF NOT EXISTS public.loja_aplicativos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  nome text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  icone text NOT NULL DEFAULT 'grid',
  categoria text NOT NULL DEFAULT 'geral',
  preco_mensal numeric NULL,
  is_active boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loja_aplicativos_pkey PRIMARY KEY (id),
  CONSTRAINT loja_aplicativos_slug_key UNIQUE (slug),
  CONSTRAINT loja_aplicativos_preco_nao_negativo CHECK (preco_mensal IS NULL OR preco_mensal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_loja_aplicativos_ativos
  ON public.loja_aplicativos (ordem, nome)
  WHERE is_active = true;

-- updated_at automático
CREATE OR REPLACE FUNCTION public.tg_loja_aplicativos_updated_at()
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

DROP TRIGGER IF EXISTS trg_loja_aplicativos_updated_at ON public.loja_aplicativos;
CREATE TRIGGER trg_loja_aplicativos_updated_at
  BEFORE UPDATE ON public.loja_aplicativos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_loja_aplicativos_updated_at();

-- RLS
ALTER TABLE public.loja_aplicativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_aplicativos" ON public.loja_aplicativos;
CREATE POLICY "user_read_aplicativos" ON public.loja_aplicativos
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "admin_read_aplicativos" ON public.loja_aplicativos;
CREATE POLICY "admin_read_aplicativos" ON public.loja_aplicativos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "admin_write_aplicativos" ON public.loja_aplicativos;
CREATE POLICY "admin_write_aplicativos" ON public.loja_aplicativos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "service_role_full_aplicativos" ON public.loja_aplicativos;
CREATE POLICY "service_role_full_aplicativos" ON public.loja_aplicativos
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.loja_aplicativos IS 'Catálogo de aplicativos instaláveis da plataforma. Admin gerencia. User consome via Loja > Aplicativos. preco_mensal NULL = grátis.';

;

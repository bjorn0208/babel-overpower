-- Trilho B5 v2 — index sem WHERE predicate com now() (não-IMMUTABLE)
CREATE TABLE IF NOT EXISTS public.comparativo_nicho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nicho_id uuid NOT NULL REFERENCES public.nichos(id) ON DELETE CASCADE,
  metrica text NOT NULL,
  valor_anonimizado jsonb NOT NULL,
  count_tenants int NOT NULL CHECK (count_tenants >= 10),
  epsilon numeric(4,2) NOT NULL DEFAULT 0.1,
  janela_dias int NOT NULL DEFAULT 30,
  calculado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE (nicho_id, metrica, janela_dias)
);

CREATE INDEX IF NOT EXISTS comparativo_nicho_nicho_metrica_idx
  ON public.comparativo_nicho (nicho_id, metrica);

CREATE INDEX IF NOT EXISTS comparativo_nicho_expira_idx
  ON public.comparativo_nicho (expira_em);

COMMENT ON TABLE public.comparativo_nicho IS
  'Trilho B5 — benchmarks por nicho com k-anonimato N>=10 + epsilon=0.1 ruido differential privacy.';

COMMENT ON COLUMN public.comparativo_nicho.count_tenants IS
  'CHECK >= 10 garante k-anonimato. Cron so insere row se atender o limiar.';

ALTER TABLE public.comparativo_nicho ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comparativo_nicho_proprio ON public.comparativo_nicho;
DROP POLICY IF EXISTS comparativo_nicho_admin_write ON public.comparativo_nicho;

CREATE POLICY comparativo_nicho_proprio ON public.comparativo_nicho
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.nicho_id = comparativo_nicho.nicho_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid()) AND ur.role = 'platform_admin'
    )
  );

CREATE POLICY comparativo_nicho_admin_write ON public.comparativo_nicho
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid()) AND ur.role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid()) AND ur.role = 'platform_admin'
    )
  );
;

-- Pastas da Base: grupos de contatos do app Base (nível único, 1 pasta por contato).
-- Contato que volta pro Conversas NÃO sai da pasta (decisão Theus 2026-07-05).
-- Chip no Conversas é tag viva: nome puxado daqui via join, nunca gravado em leads.tags.

SET lock_timeout = '4s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.pastas_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 80),
  criado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.pastas_base IS
  'Pastas do app Base: grupo visual de contatos por tenant. Soft delete via deleted_at.';

CREATE INDEX IF NOT EXISTS idx_pastas_base_tenant_ativas
  ON public.pastas_base (tenant_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.pastas_base ENABLE ROW LEVEL SECURITY;

-- Mesmo pattern de acesso da leads: admin plataforma OR dono OR membro da equipe.
DROP POLICY IF EXISTS pastas_base_select ON public.pastas_base;
CREATE POLICY pastas_base_select ON public.pastas_base
  FOR SELECT TO authenticated
  USING (
    (SELECT public.eh_admin_plataforma())
    OR tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT p.parent_user_id FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS pastas_base_insert ON public.pastas_base;
CREATE POLICY pastas_base_insert ON public.pastas_base
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.eh_admin_plataforma())
    OR tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT p.parent_user_id FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS pastas_base_update ON public.pastas_base;
CREATE POLICY pastas_base_update ON public.pastas_base
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.eh_admin_plataforma())
    OR tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT p.parent_user_id FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL
    )
  )
  WITH CHECK (
    (SELECT public.eh_admin_plataforma())
    OR tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT p.parent_user_id FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS pastas_base_delete ON public.pastas_base;
CREATE POLICY pastas_base_delete ON public.pastas_base
  FOR DELETE TO authenticated
  USING (
    (SELECT public.eh_admin_plataforma())
    OR tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT p.parent_user_id FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS srv_pastas_base ON public.pastas_base;
CREATE POLICY srv_pastas_base ON public.pastas_base
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Vínculo do contato com a pasta (1 pasta por contato; NULL = solto).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pasta_base_id uuid REFERENCES public.pastas_base(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.leads.pasta_base_id IS
  'Pasta do app Base onde o contato vive (1 só). Persiste quando ele volta pro Conversas.';

CREATE INDEX IF NOT EXISTS idx_leads_pasta_base
  ON public.leads (pasta_base_id)
  WHERE pasta_base_id IS NOT NULL;
;

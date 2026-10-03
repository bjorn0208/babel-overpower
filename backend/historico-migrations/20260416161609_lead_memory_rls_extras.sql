
SET search_path = public, auth;

-- Adiciona colunas faltantes (mantém schema pt-BR existente).
ALTER TABLE public.lead_memory ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true;
ALTER TABLE public.lead_memory ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- RLS policies (tabela estava com RLS on sem policy = acesso 0 pra authenticated).
DROP POLICY IF EXISTS lead_memory_tenant_select ON public.lead_memory;
DROP POLICY IF EXISTS lead_memory_tenant_insert ON public.lead_memory;
DROP POLICY IF EXISTS lead_memory_tenant_update ON public.lead_memory;
DROP POLICY IF EXISTS lead_memory_tenant_delete ON public.lead_memory;
DROP POLICY IF EXISTS lead_memory_service_role ON public.lead_memory;

CREATE POLICY lead_memory_tenant_select ON public.lead_memory FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR is_platform_admin());

CREATE POLICY lead_memory_tenant_insert ON public.lead_memory FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR is_platform_admin());

CREATE POLICY lead_memory_tenant_update ON public.lead_memory FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR is_platform_admin());

CREATE POLICY lead_memory_tenant_delete ON public.lead_memory FOR DELETE TO authenticated
  USING (tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR is_platform_admin());

CREATE POLICY lead_memory_service_role ON public.lead_memory FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indice combinado pra query principal (top-N ativa por lead)
CREATE INDEX IF NOT EXISTS idx_lead_memory_lead_ativa ON public.lead_memory (lead_id, ativa, criado_em DESC);

-- Trigger updated_at (mantém nome da coluna existente: atualizado_em)
CREATE OR REPLACE FUNCTION public.set_lead_memory_atualizado_em()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, auth AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_lead_memory_atualizado_em ON public.lead_memory;
CREATE TRIGGER trg_lead_memory_atualizado_em BEFORE UPDATE ON public.lead_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_memory_atualizado_em();

;

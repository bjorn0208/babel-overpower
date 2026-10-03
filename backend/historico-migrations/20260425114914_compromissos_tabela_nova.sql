CREATE TABLE IF NOT EXISTS public.compromissos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL,
  descricao text NOT NULL,
  scheduled_at timestamptz,
  origem text NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('autonomo','combinado','manual')),
  origem_turno integer,
  criado_por uuid,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','cumprido','cancelado')),
  cumprido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compromissos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compromissos_service_role ON public.compromissos;
CREATE POLICY compromissos_service_role ON public.compromissos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS compromissos_tenant_all ON public.compromissos;
CREATE POLICY compromissos_tenant_all ON public.compromissos
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR public.is_platform_admin()
  );

CREATE INDEX IF NOT EXISTS compromissos_conv_idx ON public.compromissos (conversation_id);
CREATE INDEX IF NOT EXISTS compromissos_lead_idx ON public.compromissos (lead_id);
CREATE INDEX IF NOT EXISTS compromissos_tenant_idx ON public.compromissos (tenant_id);
CREATE INDEX IF NOT EXISTS compromissos_pendentes_idx
  ON public.compromissos (tenant_id, scheduled_at)
  WHERE status = 'pendente' AND scheduled_at IS NOT NULL;

-- trigger updated_at
CREATE OR REPLACE FUNCTION public.compromissos_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compromissos_updated_at ON public.compromissos;
CREATE TRIGGER trg_compromissos_updated_at
  BEFORE UPDATE ON public.compromissos
  FOR EACH ROW EXECUTE FUNCTION public.compromissos_set_updated_at();
;

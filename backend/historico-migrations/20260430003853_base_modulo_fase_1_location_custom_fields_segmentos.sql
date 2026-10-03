-- Fase 1 do Módulo Base
-- Adiciona coluna leads.location + leads.custom_fields
-- Cria tabela base_segmentos com RLS
-- Backfill: clientes já convertidos viram location='cliente'

-- 1. Coluna leads.location
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT 'atendimento';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_location_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_location_check
      CHECK (location IN ('atendimento','base','cliente'));
  END IF;
END $$;

COMMENT ON COLUMN public.leads.location IS
  'Localização do contato: atendimento (em atendimento ativo), base (refinamento/standby), cliente (pós-venda em andamento). Campanha não é location — é estado paralelo via campaign_leads.';

-- 2. Coluna leads.custom_fields
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.leads.custom_fields IS
  'Campos personalizados livres do tenant (chave→valor string). Diferente de lead_cards.dados_capturados (do agente).';

-- 3. Backfill
UPDATE public.leads
   SET location = 'cliente'
 WHERE converted_at IS NOT NULL
   AND location = 'atendimento'
   AND deleted_at IS NULL;

-- 4. Index parcial
CREATE INDEX IF NOT EXISTS idx_leads_tenant_location
  ON public.leads (tenant_id, location)
  WHERE deleted_at IS NULL;

-- 5. Tabela base_segmentos
CREATE TABLE IF NOT EXISTS public.base_segmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome text NOT NULL,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_base_segmentos_tenant
  ON public.base_segmentos (tenant_id, criado_em DESC);

COMMENT ON TABLE public.base_segmentos IS
  'Segmentos de filtros salvos pelo tenant pra reutilizar no módulo Base e gerar campanhas.';

-- 6. RLS
ALTER TABLE public.base_segmentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_select_own_segmentos ON public.base_segmentos;
CREATE POLICY user_select_own_segmentos ON public.base_segmentos
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM public.profiles
       WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS user_insert_own_segmentos ON public.base_segmentos;
CREATE POLICY user_insert_own_segmentos ON public.base_segmentos
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM public.profiles
       WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS user_update_own_segmentos ON public.base_segmentos;
CREATE POLICY user_update_own_segmentos ON public.base_segmentos
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM public.profiles
       WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
    )
  )
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM public.profiles
       WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS user_delete_own_segmentos ON public.base_segmentos;
CREATE POLICY user_delete_own_segmentos ON public.base_segmentos
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM public.profiles
       WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS srv_base_segmentos ON public.base_segmentos;
CREATE POLICY srv_base_segmentos ON public.base_segmentos
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

;

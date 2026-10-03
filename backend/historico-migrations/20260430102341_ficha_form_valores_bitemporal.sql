-- Valores preenchidos da ficha do contato com versionamento bitemporal
-- (Curadoria v2 · F3 · pedaço 4 do destilador). Cada valor histórico é
-- preservado · só 1 versão atual por par (lead, campo) via UNIQUE partial.

CREATE TABLE IF NOT EXISTS public.ficha_form_valores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL,
  campo_id        uuid NOT NULL REFERENCES public.ficha_form_campos(id) ON DELETE CASCADE,
  valor           jsonb NOT NULL,
  valor_texto     text GENERATED ALWAYS AS (
                    CASE jsonb_typeof(valor)
                      WHEN 'string' THEN valor #>> '{}'
                      WHEN 'number' THEN valor::text
                      WHEN 'boolean' THEN valor::text
                      ELSE valor::text
                    END
                  ) STORED,
  real_world_valid_from timestamptz,
  real_world_valid_to   timestamptz,
  valid_from      timestamptz NOT NULL DEFAULT now(),
  valid_to        timestamptz,
  substituido_por_id uuid REFERENCES public.ficha_form_valores(id),
  recorded_by     text NOT NULL DEFAULT 'agente'
                    CHECK (recorded_by IN ('agente','atendente','tenant','destilacao_cron')),
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

-- Garante 1 versão atual por par (lead, campo)
CREATE UNIQUE INDEX IF NOT EXISTS ficha_form_valores_atual_uniq
  ON public.ficha_form_valores (lead_id, campo_id)
  WHERE valid_to IS NULL;

-- Lookup por lead (RAG do agente)
CREATE INDEX IF NOT EXISTS ficha_form_valores_lead_idx
  ON public.ficha_form_valores (lead_id, valid_to);

-- FK indexes obrigatórios
CREATE INDEX IF NOT EXISTS ficha_form_valores_campo_idx
  ON public.ficha_form_valores (campo_id);

CREATE INDEX IF NOT EXISTS ficha_form_valores_tenant_idx
  ON public.ficha_form_valores (tenant_id);

ALTER TABLE public.ficha_form_valores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ffv_service_role ON public.ficha_form_valores;
CREATE POLICY ffv_service_role ON public.ficha_form_valores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ffv_tenant_select ON public.ficha_form_valores;
CREATE POLICY ffv_tenant_select ON public.ficha_form_valores
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid())
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS ffv_tenant_insert ON public.ficha_form_valores;
CREATE POLICY ffv_tenant_insert ON public.ficha_form_valores
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid())
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS ffv_tenant_update ON public.ficha_form_valores;
CREATE POLICY ffv_tenant_update ON public.ficha_form_valores
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid())
    )
    OR public.is_platform_admin()
  );

COMMENT ON TABLE public.ficha_form_valores IS 'Valores preenchidos da ficha do contato (Curadoria v2 · F3). Bitemporal: real_world_valid_from/to (quando o fato é/era verdade no mundo) + valid_from/to (quando foi registrado no sistema). Histórico nunca apagado. UNIQUE partial garante só 1 versão atual por (lead, campo). Source: agente|atendente|tenant|destilacao_cron.';

-- View pra consulta rápida do valor atual de cada campo por lead
CREATE OR REPLACE VIEW public.v_ficha_form_valores_atual
WITH (security_invoker = true)
AS
SELECT v.*, c.chave, c.rotulo, c.tipo, c.secao, c.niche_id
FROM public.ficha_form_valores v
JOIN public.ficha_form_campos c ON c.id = v.campo_id
WHERE v.valid_to IS NULL AND c.deleted_at IS NULL AND c.ativo = true;

COMMENT ON VIEW public.v_ficha_form_valores_atual IS 'Valor atual (valid_to IS NULL) de cada campo da ficha por lead, com metadata do campo. security_invoker pra honrar RLS do tenant.';

;


-- Tabela de incidentes de seguranca detectados pelo motor cognitivo (Camada 1/3).
-- Captura tentativas de prompt injection, vazamento de PII, anomalias.
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('prompt_injection', 'pii_leak', 'pii_capturado_lead', 'anomalia')),
  severidade text NOT NULL CHECK (severidade IN ('baixa', 'media', 'alta')),
  detalhes jsonb DEFAULT '{}'::jsonb,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_tenant ON public.security_incidents(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_incidents_conv ON public.security_incidents(conversation_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_tipo ON public.security_incidents(tipo, severidade);

ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;

-- Tenant ve so seus incidentes (proprios + sub-usuarios)
DROP POLICY IF EXISTS "tenants_select_own_incidents" ON public.security_incidents;
CREATE POLICY "tenants_select_own_incidents" ON public.security_incidents
  FOR SELECT USING (
    tenant_id = auth.uid()
    OR tenant_id IN (SELECT id FROM public.profiles WHERE parent_user_id = auth.uid())
  );

-- Service role tem acesso total (usado por edge functions)
DROP POLICY IF EXISTS "service_role_all_incidents" ON public.security_incidents;
CREATE POLICY "service_role_all_incidents" ON public.security_incidents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Platform admins veem tudo (system_role = 'platform_admin')
DROP POLICY IF EXISTS "platform_admin_all_incidents" ON public.security_incidents;
CREATE POLICY "platform_admin_all_incidents" ON public.security_incidents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

;

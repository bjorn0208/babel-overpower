
-- =============================================
-- ACTIVITY LOGS
-- =============================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id_created_at 
  ON public.activity_logs(user_id, created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Usuario ve so seus logs
CREATE POLICY activity_logs_user_read ON public.activity_logs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Admin ve todos
CREATE POLICY activity_logs_admin_read ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = (SELECT auth.uid()) AND system_role = 'platform_admin'
    )
  );

-- Insert via RPC (nao direto)
CREATE POLICY activity_logs_insert ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- RPC para logar atividade
CREATE OR REPLACE FUNCTION public.log_activity(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES ((SELECT auth.uid()), p_action, p_entity_type, p_entity_id, p_metadata);
END;
$$;

-- =============================================
-- LGPD: EXPORT MY DATA
-- =============================================

CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile', (
      SELECT row_to_json(p)::jsonb FROM public.profiles p WHERE p.id = v_uid
    ),
    'leads', (
      SELECT COALESCE(jsonb_agg(row_to_json(l)::jsonb), '[]'::jsonb)
      FROM public.leads l WHERE l.tenant_id = v_uid
    ),
    'contracts', (
      SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb)
      FROM public.contracts c WHERE c.tenant_id = v_uid
    ),
    'comissoes', (
      SELECT COALESCE(jsonb_agg(row_to_json(mc)::jsonb), '[]'::jsonb)
      FROM public.multinivel_comissoes mc WHERE mc.beneficiario_id = v_uid
    ),
    'saques', (
      SELECT COALESCE(jsonb_agg(row_to_json(ms)::jsonb), '[]'::jsonb)
      FROM public.multinivel_saques ms WHERE ms.user_id = v_uid
    ),
    'purchase_orders', (
      SELECT COALESCE(jsonb_agg(row_to_json(po)::jsonb), '[]'::jsonb)
      FROM public.purchase_orders po WHERE po.user_id = v_uid
    ),
    'activity_logs', (
      SELECT COALESCE(jsonb_agg(row_to_json(al)::jsonb), '[]'::jsonb)
      FROM public.activity_logs al WHERE al.user_id = v_uid
    ),
    'exported_at', now()::text
  ) INTO v_result;
  
  -- Log a exportacao
  INSERT INTO public.activity_logs (user_id, action, entity_type, metadata)
  VALUES (v_uid, 'export_data', 'profile', '{"type":"lgpd_export"}'::jsonb);
  
  RETURN v_result;
END;
$$;

-- =============================================
-- LGPD: REQUEST ACCOUNT DELETION
-- =============================================

-- Coluna para marcar solicitacao de exclusao
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  UPDATE public.profiles 
  SET deletion_requested_at = now()
  WHERE id = v_uid;
  
  INSERT INTO public.activity_logs (user_id, action, entity_type, metadata)
  VALUES (v_uid, 'request_deletion', 'profile', '{"type":"lgpd_deletion_request"}'::jsonb);
END;
$$;

;

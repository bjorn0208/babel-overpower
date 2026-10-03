
-- ============================================================
-- MIGRATION: Security fixes
-- 1. Enable RLS on webhook_debug
-- 2. Fix srv_client_documents policy (public -> service_role)
-- 3. Set search_path on 7 functions
-- ============================================================

-- 1. webhook_debug: enable RLS + admin-only policy
ALTER TABLE public.webhook_debug ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_webhook_debug" ON public.webhook_debug
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.system_role = 'platform_admin'
    )
  );

CREATE POLICY "srv_webhook_debug" ON public.webhook_debug
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Fix srv_client_documents: drop public, recreate as service_role
DROP POLICY IF EXISTS "srv_client_documents" ON public.client_documents;

CREATE POLICY "srv_client_documents" ON public.client_documents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. Fix search_path on functions

-- check_rate_limit
ALTER FUNCTION public.check_rate_limit(text, text, integer, integer)
  SET search_path = public;

-- hybrid_search
ALTER FUNCTION public.hybrid_search(text, text, uuid, integer, double precision, double precision, integer, text[])
  SET search_path = public, extensions;

-- increment_conversas_usadas
ALTER FUNCTION public.increment_conversas_usadas(uuid)
  SET search_path = public;

-- knowledge_chunks_fts_trigger
ALTER FUNCTION public.knowledge_chunks_fts_trigger()
  SET search_path = public;

-- processar_comissao_multinivel
ALTER FUNCTION public.processar_comissao_multinivel()
  SET search_path = public;

-- update_lead_cards_updated_at
ALTER FUNCTION public.update_lead_cards_updated_at()
  SET search_path = public;

-- update_subscription_updated_at
ALTER FUNCTION public.update_subscription_updated_at()
  SET search_path = public;

;

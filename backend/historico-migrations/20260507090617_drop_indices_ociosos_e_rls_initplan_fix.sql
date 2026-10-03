-- ============================================================
-- M002-S04 follow-up — drop índices com idx_scan = 0 confirmado
-- + M002-S05 partial — fix 4 RLS initplan (wrap auth.uid() em select)
-- 
-- Investigação 2026-05-07 06:08 BRT via pg_stat_user_indexes:
--   idx_campaigns_ativas:        0 scans  (zumbi — predicate filtra status='active' EN extinto)
--   idx_rate_limits_lookup:      0 scans  (dup ASC do par DESC, sem uso)
--   lead_memory_longo_lead_idx:  0 scans  (partial nunca matchou)
--
-- Pares com uso real preservados (drop adiado):
--   webhook_dedup_received_at_idx (4617 scans) vs idx_webhook_dedup_received (2080)
--   engajamento_turnos_*_key (5411) vs idx_engajamento_turnos_conv_turno (328)
-- ============================================================

-- 1) Drops idempotentes
DROP INDEX IF EXISTS public.idx_campaigns_ativas;
DROP INDEX IF EXISTS public.idx_rate_limits_lookup;
DROP INDEX IF EXISTS public.lead_memory_longo_lead_idx;

-- 2) Fix RLS initplan — wrap auth.uid() em (select auth.uid()) pra evitar
--    re-eval por linha. Sem mudança semântica.

-- 2a) public.exclusoes_tenant
DROP POLICY IF EXISTS tenant_opt_outs_all_own ON public.exclusoes_tenant;
CREATE POLICY tenant_opt_outs_all_own ON public.exclusoes_tenant
  FOR ALL
  TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

-- 2b) public.prompts_mensagem
DROP POLICY IF EXISTS platform_admin_select_message_prompts ON public.prompts_mensagem;
CREATE POLICY platform_admin_select_message_prompts ON public.prompts_mensagem
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  );

-- 2c) public.limiares_gatilho — ALL
DROP POLICY IF EXISTS platform_admin_all_trigger_thresholds ON public.limiares_gatilho;
CREATE POLICY platform_admin_all_trigger_thresholds ON public.limiares_gatilho
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  );

-- 2d) public.limiares_gatilho — SELECT
DROP POLICY IF EXISTS platform_admin_select_trigger_thresholds ON public.limiares_gatilho;
CREATE POLICY platform_admin_select_trigger_thresholds ON public.limiares_gatilho
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  );

COMMENT ON POLICY tenant_opt_outs_all_own ON public.exclusoes_tenant IS
  'tenant proprio — auth.uid() wrapped pra performance (corrigido 2026-05-07)';
COMMENT ON POLICY platform_admin_select_message_prompts ON public.prompts_mensagem IS
  'platform_admin SELECT — auth.uid() wrapped pra performance (corrigido 2026-05-07)';
COMMENT ON POLICY platform_admin_all_trigger_thresholds ON public.limiares_gatilho IS
  'platform_admin ALL — auth.uid() wrapped pra performance (corrigido 2026-05-07)';
COMMENT ON POLICY platform_admin_select_trigger_thresholds ON public.limiares_gatilho IS
  'platform_admin SELECT — auth.uid() wrapped pra performance (corrigido 2026-05-07)';

;

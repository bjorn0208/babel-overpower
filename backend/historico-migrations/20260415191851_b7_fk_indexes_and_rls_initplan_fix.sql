
-- B.7.1: índices pras 8 FK sem covering index (perf INFO)
CREATE INDEX IF NOT EXISTS idx_cobranca_eventos_conversation ON public.cobranca_eventos(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cobranca_eventos_usuario ON public.cobranca_eventos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_human_chunks_nicho ON public.human_chunks(nicho_id);
CREATE INDEX IF NOT EXISTS idx_human_chunks_tenant ON public.human_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_memory_conversation ON public.lead_memory(conversation_id);
CREATE INDEX IF NOT EXISTS idx_perguntas_sem_resposta_conversation ON public.perguntas_sem_resposta(conversation_id);
CREATE INDEX IF NOT EXISTS idx_trigger_chunks_nicho ON public.trigger_chunks(nicho_id);
CREATE INDEX IF NOT EXISTS idx_trigger_chunks_tenant ON public.trigger_chunks(tenant_id);

-- B.7.2: auth.uid() direto -> (select auth.uid()) pra resolver initplan leak (perf WARN)
DROP POLICY IF EXISTS "cobranca_configs tenant owner" ON public.cobranca_configs;
CREATE POLICY "cobranca_configs tenant owner" ON public.cobranca_configs
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

DROP POLICY IF EXISTS "cobranca_eventos tenant insert" ON public.cobranca_eventos;
CREATE POLICY "cobranca_eventos tenant insert" ON public.cobranca_eventos
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (select auth.uid()));

DROP POLICY IF EXISTS "cobranca_eventos tenant read" ON public.cobranca_eventos;
CREATE POLICY "cobranca_eventos tenant read" ON public.cobranca_eventos
  FOR SELECT TO authenticated
  USING (tenant_id = (select auth.uid()));

DROP POLICY IF EXISTS "platform_admin_all_incidents" ON public.security_incidents;
CREATE POLICY "platform_admin_all_incidents" ON public.security_incidents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'
  ));

DROP POLICY IF EXISTS "tenants_select_own_incidents" ON public.security_incidents;
CREATE POLICY "tenants_select_own_incidents" ON public.security_incidents
  FOR SELECT TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR tenant_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.parent_user_id = (select auth.uid()))
  );

;

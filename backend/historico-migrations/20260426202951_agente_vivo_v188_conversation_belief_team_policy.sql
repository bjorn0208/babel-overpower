-- Reescreve RLS de conversation_belief pra cobrir subordinados (equipe).
-- Pattern espelhado de lead_cards.user_read_lead_cards.
-- Antes: tenant_id = auth.uid() OR is_platform_admin() · não cobria sub-tenants.
-- Sintoma: ficha do chat-test não atualizava em modo "Visualizando como Diego".
-- Realtime do Supabase aplica RLS no payload — sem policy correta, o evento simplesmente não chega.

DROP POLICY IF EXISTS conversation_belief_tenant_all ON public.conversation_belief;

-- Read: dono direto OU subordinado (parent_user_id = tenant_id) OU admin.
CREATE POLICY user_read_conversation_belief ON public.conversation_belief
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.parent_user_id = conversation_belief.tenant_id
    )
    OR is_platform_admin()
  );

-- Write: mesmo escopo (sub-tenant pode atualizar belief da conversa que ele acompanha).
CREATE POLICY user_write_conversation_belief ON public.conversation_belief
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.parent_user_id = conversation_belief.tenant_id
    )
    OR is_platform_admin()
  )
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.parent_user_id = conversation_belief.tenant_id
    )
    OR is_platform_admin()
  );

-- service_role mantém bypass total (já existe `conversation_belief_service_all`).
;

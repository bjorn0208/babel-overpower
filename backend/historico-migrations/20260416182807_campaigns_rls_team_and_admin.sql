-- Substitui policies das 4 tabelas da campanha pra suportar team members (parent_user_id)
-- e platform admin (is_platform_admin()) — mesmo padrão de leads.

-- Helper: expressão de ownership "é o tenant OU é membro do tenant OU é admin"
-- usada embutida nas policies.

-- campaigns
DROP POLICY IF EXISTS campaigns_select_own ON public.campaigns;
DROP POLICY IF EXISTS campaigns_insert_own ON public.campaigns;
DROP POLICY IF EXISTS campaigns_update_own ON public.campaigns;
DROP POLICY IF EXISTS campaigns_delete_own ON public.campaigns;

CREATE POLICY campaigns_select_own ON public.campaigns
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
    )
    OR is_platform_admin()
  );

CREATE POLICY campaigns_insert_own ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
    )
    OR is_platform_admin()
  );

CREATE POLICY campaigns_update_own ON public.campaigns
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
    )
    OR is_platform_admin()
  );

CREATE POLICY campaigns_delete_own ON public.campaigns
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
    )
    OR is_platform_admin()
  );

-- Tabelas filhas (campaign_phases, campaign_leads, campaign_automations):
-- a policy verifica que a campanha-mãe é acessível via a policy de campaigns.
-- Como o USING delas faz SELECT em campaigns, já herdaria automaticamente — mas
-- as policies atuais usam tenant_id = auth.uid() literal sem herdar. Vou reescrever
-- pra apontar pro mesmo helper composto.

-- campaign_phases
DROP POLICY IF EXISTS campaign_phases_select_own ON public.campaign_phases;
DROP POLICY IF EXISTS campaign_phases_mutate_own ON public.campaign_phases;

CREATE POLICY campaign_phases_select_own ON public.campaign_phases
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_phases.campaign_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR c.tenant_id IN (
            SELECT parent_user_id FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
          )
          OR is_platform_admin()
        )
    )
  );

CREATE POLICY campaign_phases_mutate_own ON public.campaign_phases
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_phases.campaign_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR c.tenant_id IN (
            SELECT parent_user_id FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
          )
          OR is_platform_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_phases.campaign_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR c.tenant_id IN (
            SELECT parent_user_id FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
          )
          OR is_platform_admin()
        )
    )
  );

-- campaign_leads
DROP POLICY IF EXISTS campaign_leads_select_own ON public.campaign_leads;
DROP POLICY IF EXISTS campaign_leads_mutate_own ON public.campaign_leads;

CREATE POLICY campaign_leads_select_own ON public.campaign_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_leads.campaign_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR c.tenant_id IN (
            SELECT parent_user_id FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
          )
          OR is_platform_admin()
        )
    )
  );

CREATE POLICY campaign_leads_mutate_own ON public.campaign_leads
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_leads.campaign_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR c.tenant_id IN (
            SELECT parent_user_id FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
          )
          OR is_platform_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_leads.campaign_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR c.tenant_id IN (
            SELECT parent_user_id FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
          )
          OR is_platform_admin()
        )
    )
  );

-- campaign_automations
DROP POLICY IF EXISTS campaign_automations_all_own ON public.campaign_automations;

CREATE POLICY campaign_automations_all_own ON public.campaign_automations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_automations.campaign_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR c.tenant_id IN (
            SELECT parent_user_id FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
          )
          OR is_platform_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_automations.campaign_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR c.tenant_id IN (
            SELECT parent_user_id FROM public.profiles
            WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL
          )
          OR is_platform_admin()
        )
    )
  );
;

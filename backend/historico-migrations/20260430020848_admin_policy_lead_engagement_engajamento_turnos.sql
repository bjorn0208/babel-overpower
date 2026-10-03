-- Permite platform_admin enxergar lead_engagement + engajamento_turnos sem impersonar.
-- Sem isso, ficha unificada (badge no topo + bloco aba Mente) ficava "sem dados ainda"
-- pra admin auditando tenants (RLS bloqueava porque auth.uid() != tenant_id).
-- Padrão consistente com agente_identidade, anti_padroes, behavior_chunks, etc.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.lead_engagement'::regclass
      AND polname = 'admin_all_lead_engagement'
  ) THEN
    EXECUTE $p$
      CREATE POLICY admin_all_lead_engagement
      ON public.lead_engagement
      FOR ALL
      TO authenticated
      USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin())
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.engajamento_turnos'::regclass
      AND polname = 'admin_all_engajamento_turnos'
  ) THEN
    EXECUTE $p$
      CREATE POLICY admin_all_engajamento_turnos
      ON public.engajamento_turnos
      FOR ALL
      TO authenticated
      USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin())
    $p$;
  END IF;
END$$;
;

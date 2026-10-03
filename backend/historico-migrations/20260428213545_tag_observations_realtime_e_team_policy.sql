
-- Estende policy de tag_observations para cobrir equipe (dono + subordinado + platform admin),
-- igualando ao padrão já aplicado em conversation_belief.
DROP POLICY IF EXISTS tenant_all ON public.tag_observations;

CREATE POLICY tag_observations_team_all ON public.tag_observations
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM public.profiles WHERE parent_user_id = tag_observations.tenant_id
    )
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM public.profiles WHERE parent_user_id = tag_observations.tenant_id
    )
    OR public.is_platform_admin()
  );

-- Realtime · ficha precisa receber sinais ao vivo conforme conversa anda.
ALTER TABLE public.tag_observations REPLICA IDENTITY FULL;

-- ADD TABLE é idempotente lógicamente (se já existir, lança erro), guardamos com DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tag_observations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tag_observations';
  END IF;
END $$;

;

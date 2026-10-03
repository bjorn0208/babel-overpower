-- Adiciona policy admin_all_<gaveta> nas 7 gavetas novas que hoje só permitem
-- ALL em escopo='tenant'. Padrão igual ao admin_all_behavior_chunks (legacy).
-- Bug: UI de curadoria cria chunks com escopo='global' ou 'nicho' como
-- platform_admin, mas as policies bloqueavam silenciosamente o INSERT.

DO $$
BEGIN
  -- 1. diretriz_bolha_chunks
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='diretriz_bolha_chunks'
      AND policyname='admin_all_diretriz_bolha'
  ) THEN
    CREATE POLICY admin_all_diretriz_bolha ON public.diretriz_bolha_chunks
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ));
  END IF;

  -- 2. manipulacao_chunks
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='manipulacao_chunks'
      AND policyname='admin_all_manipulacao'
  ) THEN
    CREATE POLICY admin_all_manipulacao ON public.manipulacao_chunks
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ));
  END IF;

  -- 3. emocao_chunks
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='emocao_chunks'
      AND policyname='admin_all_emocao'
  ) THEN
    CREATE POLICY admin_all_emocao ON public.emocao_chunks
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ));
  END IF;

  -- 4. prova_social_chunks
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='prova_social_chunks'
      AND policyname='admin_all_prova_social'
  ) THEN
    CREATE POLICY admin_all_prova_social ON public.prova_social_chunks
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ));
  END IF;

  -- 5. anti_padroes
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='anti_padroes'
      AND policyname='admin_all_anti_padroes'
  ) THEN
    CREATE POLICY admin_all_anti_padroes ON public.anti_padroes
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ));
  END IF;

  -- 6. agente_identidade (sem coluna escopo · só tenant_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='agente_identidade'
      AND policyname='admin_all_agente_identidade'
  ) THEN
    CREATE POLICY admin_all_agente_identidade ON public.agente_identidade
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ));
  END IF;

  -- 7. regras_operacionais_chunks (admin pode criar/editar regras globais e por nicho)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='regras_operacionais_chunks'
      AND policyname='admin_all_regras_op'
  ) THEN
    CREATE POLICY admin_all_regras_op ON public.regras_operacionais_chunks
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.system_role = 'platform_admin'
      ));
  END IF;
END $$;
;

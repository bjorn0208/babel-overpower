-- Curadoria: o admin da plataforma não enxergava candidatos_bloco (RLS só tenant_id = auth.uid()),
-- então a bandeja "Candidatos pendentes" do Cross-Nicho ficava sempre vazia e aprovar/recusar não tinha efeito.
-- Mesmo padrão das outras tabelas da curadoria (eh_admin_plataforma()).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='candidatos_bloco' AND policyname='admin_all_candidatos_bloco') THEN
    CREATE POLICY admin_all_candidatos_bloco ON public.candidatos_bloco
      TO authenticated
      USING ((SELECT public.eh_admin_plataforma()))
      WITH CHECK ((SELECT public.eh_admin_plataforma()));
  ELSE
    RAISE NOTICE 'admin_all_candidatos_bloco já existe';
  END IF;
END $$;

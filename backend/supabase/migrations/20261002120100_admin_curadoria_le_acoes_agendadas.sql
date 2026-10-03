-- Curadoria (Acompanhamentos e fila dos Gatilhos): o admin da plataforma não enxergava nem cancelava
-- acoes_agendadas (RLS só via conversa do tenant). Concede leitura e atualização ao admin (eh_admin_plataforma()).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='acoes_agendadas' AND policyname='admin_select_acoes_agendadas') THEN
    CREATE POLICY admin_select_acoes_agendadas ON public.acoes_agendadas FOR SELECT TO authenticated
      USING ((SELECT public.eh_admin_plataforma()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='acoes_agendadas' AND policyname='admin_update_acoes_agendadas') THEN
    CREATE POLICY admin_update_acoes_agendadas ON public.acoes_agendadas FOR UPDATE TO authenticated
      USING ((SELECT public.eh_admin_plataforma())) WITH CHECK ((SELECT public.eh_admin_plataforma()));
  END IF;
END $$;

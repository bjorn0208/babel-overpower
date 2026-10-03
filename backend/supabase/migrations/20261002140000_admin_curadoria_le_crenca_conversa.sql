-- Curadoria → aba Conversa (dossiê do lead): o admin não lia a "crença" do agente sobre a conversa.
-- crenca_conversa é view (security_invoker) sobre public.prancheta, cuja RLS só libera o tenant.
-- Leitura para o admin da plataforma na tabela base.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='prancheta' AND policyname='admin_select_prancheta') THEN
    CREATE POLICY admin_select_prancheta ON public.prancheta FOR SELECT TO authenticated
      USING ((SELECT public.eh_admin_plataforma()));
  END IF;
END $$;

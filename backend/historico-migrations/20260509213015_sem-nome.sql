
-- Drops idempotentes
DROP POLICY IF EXISTS cronjobs_config_select_admin ON public.agendamentos_config;
DROP POLICY IF EXISTS cronjobs_log_select_admin ON public.agendamentos_log;

CREATE POLICY cronjobs_config_select_admin ON public.agendamentos_config
  FOR SELECT TO authenticated USING (eh_admin_plataforma());
CREATE POLICY cronjobs_log_select_admin ON public.agendamentos_log
  FOR SELECT TO authenticated USING (eh_admin_plataforma());

;


CREATE TABLE IF NOT EXISTS public.impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  motivo text,
  ip_address text,
  user_agent text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apenas admins leem impersonation_log"
  ON public.impersonation_log FOR SELECT
  USING (public.eh_super_admin(auth.uid()));

CREATE POLICY "Apenas admins inserem impersonation_log"
  ON public.impersonation_log FOR INSERT
  WITH CHECK (public.eh_super_admin(auth.uid()));

CREATE POLICY "Apenas admins atualizam impersonation_log"
  ON public.impersonation_log FOR UPDATE
  USING (public.eh_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_impersonation_log_admin ON public.impersonation_log(admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_log_target ON public.impersonation_log(target_user_id, started_at DESC);

;

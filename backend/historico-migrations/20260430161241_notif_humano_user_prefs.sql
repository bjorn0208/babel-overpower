-- Preferências de notificação por usuário (humano) · 1 row por user_id
CREATE TABLE IF NOT EXISTS public.user_notif_prefs (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  som_id                  text REFERENCES public.notification_sounds(id) ON DELETE SET NULL,
  som_handoff_id          text REFERENCES public.notification_sounds(id) ON DELETE SET NULL,
  som_ativo               boolean NOT NULL DEFAULT true,
  som_handoff_ativo       boolean NOT NULL DEFAULT true,
  navegador_ativo         boolean NOT NULL DEFAULT true,
  titulo_piscante_ativo   boolean NOT NULL DEFAULT true,
  modulos_silenciados     text[] NOT NULL DEFAULT '{}',
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_som_id ON public.user_notif_prefs (som_id);
CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_som_handoff_id ON public.user_notif_prefs (som_handoff_id);

ALTER TABLE public.user_notif_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_le_proprias" ON public.user_notif_prefs;
CREATE POLICY "user_le_proprias" ON public.user_notif_prefs
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_atualiza_proprias" ON public.user_notif_prefs;
CREATE POLICY "user_atualiza_proprias" ON public.user_notif_prefs
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

COMMENT ON TABLE public.user_notif_prefs IS
  'Preferencias de notificacao por usuario (humano) - 1 row por user_id - default: som ligado em elegant.mp3 / handoff em achievement.mp3';
;

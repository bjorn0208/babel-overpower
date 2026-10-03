ALTER TABLE public.preferencias_ui_usuario
  ADD COLUMN IF NOT EXISTS apps_fixados jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.preferencias_ui_usuario.apps_fixados IS
  'Lista de slugs de apps fixados no Dock pelo usuário. Persiste a escolha do pino no Launchpad entre sessões.';
;

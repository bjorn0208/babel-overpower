-- Check-in de entrega do ritual bom-dia (Theus 2026-09-02): hoje a tabela só
-- marca "já mandei" (saudado_em/followup_em), nunca "chegou ou não". Colunas
-- novas gravadas pelo cron-bom-dia-rifa a cada tentativa real.
ALTER TABLE public.rifa_bom_dia_envios
  ADD COLUMN IF NOT EXISTS status_saudacao text,
  ADD COLUMN IF NOT EXISTS erro_saudacao text,
  ADD COLUMN IF NOT EXISTS status_followup text,
  ADD COLUMN IF NOT EXISTS erro_followup text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rifa_bom_dia_envios_status_saudacao_check'
  ) THEN
    ALTER TABLE public.rifa_bom_dia_envios
      ADD CONSTRAINT rifa_bom_dia_envios_status_saudacao_check
      CHECK (status_saudacao IS NULL OR status_saudacao IN ('sucesso','erro'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rifa_bom_dia_envios_status_followup_check'
  ) THEN
    ALTER TABLE public.rifa_bom_dia_envios
      ADD CONSTRAINT rifa_bom_dia_envios_status_followup_check
      CHECK (status_followup IS NULL OR status_followup IN ('sucesso','erro'));
  END IF;
END $$;

COMMENT ON COLUMN public.rifa_bom_dia_envios.status_saudacao IS 'sucesso|erro|NULL (ainda não passou pela etapa 07h hoje)';
COMMENT ON COLUMN public.rifa_bom_dia_envios.status_followup IS 'sucesso|erro|NULL (ainda não passou pela etapa 12h hoje)';

;

ALTER TABLE public.contract_settings
  ADD COLUMN IF NOT EXISTS default_required_fields text[] NOT NULL DEFAULT '{nome_completo}',
  ADD COLUMN IF NOT EXISTS default_selfie_instruction text DEFAULT NULL;
;

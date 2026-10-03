ALTER TABLE public.contratos_template
  ADD COLUMN IF NOT EXISTS required_fields text[] NOT NULL DEFAULT '{nome_completo}',
  ADD COLUMN IF NOT EXISTS selfie_instruction text DEFAULT NULL;
;

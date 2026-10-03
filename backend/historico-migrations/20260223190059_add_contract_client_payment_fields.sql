ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS client_fields text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payment_options jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_details jsonb DEFAULT '{}';
;

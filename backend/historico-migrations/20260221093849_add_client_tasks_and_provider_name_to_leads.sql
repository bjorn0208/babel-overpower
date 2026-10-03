ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_tasks jsonb DEFAULT '[]'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS provider_name text DEFAULT null;
;

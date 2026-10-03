ALTER TABLE channels ADD COLUMN IF NOT EXISTS zapi_api_url text DEFAULT 'https://api.z-api.io';
;

CREATE TABLE IF NOT EXISTS webhook_debug_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  received_at timestamptz DEFAULT now(),
  client_token text,
  body_keys text,
  instance_id text,
  phone text,
  from_me boolean,
  is_group boolean,
  event_type text,
  status_field text,
  message_text text,
  raw_body jsonb
);
;

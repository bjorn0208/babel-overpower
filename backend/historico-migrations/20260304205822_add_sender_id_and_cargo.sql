-- Add sender_id to messages (tracks which human sent the message)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);

-- Add cargo to profiles (job title for team members)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;
;

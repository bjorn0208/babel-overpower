-- Adicionar 'system' ao CHECK constraint de role na tabela messages
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_role_check 
  CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'human'::text, 'system'::text]));
;

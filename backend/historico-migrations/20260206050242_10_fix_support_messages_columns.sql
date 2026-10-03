
-- Adicionar colunas que o frontend espera para o chat de suporte
ALTER TABLE support_messages 
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS sender text DEFAULT 'user';

;

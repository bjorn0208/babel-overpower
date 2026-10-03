-- Adicionar colunas faltantes em support_messages
ALTER TABLE support_messages 
ADD COLUMN IF NOT EXISTS user_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS user_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS content TEXT,
ADD COLUMN IF NOT EXISTS sender VARCHAR(50) DEFAULT 'user';

-- Atualizar content com message se existir
UPDATE support_messages SET content = message WHERE content IS NULL AND message IS NOT NULL;
;

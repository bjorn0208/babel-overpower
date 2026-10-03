-- Adiciona coluna visto_em pra rastrear última leitura humana de cada conversa
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS visto_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_unread_humano
  ON public.conversations (tenant_id, agent_enabled)
  WHERE agent_enabled = false;

COMMENT ON COLUMN public.conversations.visto_em IS
  'Última vez que humano abriu/visualizou a conversa. NULL = nunca aberta. Comparado com messages.created_at pra detectar não lidas.';
;

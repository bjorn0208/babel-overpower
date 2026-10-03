-- Marca conversa onde Gemma detectou que o lead se despediu MAS não acertou data de retorno.
-- Cron-sweep usa essa coluna pra acordar planejamento de retomada (4ª automação · DEC-017).
-- Reset pra NULL quando lead volta a falar (post-llm.ts).
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS despedida_sem_data_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_despedida_sem_data
  ON public.conversations (despedida_sem_data_at)
  WHERE despedida_sem_data_at IS NOT NULL;

COMMENT ON COLUMN public.conversations.despedida_sem_data_at IS
  'Timestamp do turno em que Gemma detectou despedida do lead sem acordo de data
   pra retornar. NULL = sem despedida ou lead voltou a conversar. Cron-sweep cria
   automação de retomada quando essa coluna está preenchida + zero compromisso ativo.';
;

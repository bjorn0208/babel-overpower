-- Armazena o prompt completo enviado pra LLM em cada turno.
-- Visível APENAS pra platform_admin (debug de curadoria RAG).
CREATE TABLE IF NOT EXISTS public.message_prompts (
  message_id UUID PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  system_prompt TEXT NOT NULL,
  user_message TEXT NOT NULL,
  chunks_usados JSONB DEFAULT '{}'::jsonb,
  trigger_disparado JSONB,
  rag_ativacao JSONB,
  turno_tipo TEXT,
  fase_atual TEXT,
  modelo TEXT,
  bolhas_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_prompts_conversation
  ON public.message_prompts(conversation_id, created_at DESC);

ALTER TABLE public.message_prompts ENABLE ROW LEVEL SECURITY;

-- SELECT só pra platform_admin (debug de RAG)
CREATE POLICY "platform_admin_select_message_prompts"
  ON public.message_prompts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.system_role = 'platform_admin'
    )
  );

-- INSERT só service_role (edge function). Sem policy pra authenticated/anon = bloqueado.

COMMENT ON TABLE public.message_prompts IS 'Snapshot do prompt enviado a LLM por turno. Visível só pra platform_admin debugar RAG.';
;

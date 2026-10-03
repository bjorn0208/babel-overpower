
SET search_path = public, auth;

CREATE TABLE IF NOT EXISTS public.lead_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN ('dor', 'preferencia', 'fato_pessoal', 'objetivo', 'contexto_profissional', 'nota_operador')),
  conteudo text NOT NULL CHECK (char_length(conteudo) BETWEEN 3 AND 500),
  relevancia text NOT NULL DEFAULT 'media' CHECK (relevancia IN ('alta', 'media', 'baixa')),
  fonte text NOT NULL CHECK (fonte IN ('conversa_anterior', 'formulario', 'operador', 'auto_llm')),
  ativa boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  embedding halfvec(1536),
  embedding_status text NOT NULL DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed'))
);

;

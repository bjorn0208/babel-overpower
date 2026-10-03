-- Onda C1 — Control plane das chamadas LLM do motor RAG
-- Permite editar modelo/temperatura/prompt/gavetas sem deploy de edge function.

-- Tabela principal: configuração viva por chamada
CREATE TABLE IF NOT EXISTS public.config_chamadas_llm (
  id text PRIMARY KEY,                      -- 'porteiro', 'sintese', 'extrator', 'mentor', etc
  nome text NOT NULL,
  descricao text,
  modelo text NOT NULL,                     -- soft FK pra modelos_llm.codigo (sem hard FK por flexibilidade)
  temperatura numeric(3,2) NOT NULL DEFAULT 0.7 CHECK (temperatura >= 0 AND temperatura <= 2),
  max_tokens int NOT NULL DEFAULT 1024 CHECK (max_tokens > 0 AND max_tokens <= 32768),
  prompt_sistema text NOT NULL DEFAULT '',
  gavetas text[] NOT NULL DEFAULT '{}',     -- lista de tabelas de blocos consultadas
  versao int NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.config_chamadas_llm IS
  'Onda C1 — control plane: configuração viva por chamada LLM do motor RAG. Editável via Curadoria > Chamadas LLM sem deploy.';

-- Histórico de versões pra auditoria + restore
CREATE TABLE IF NOT EXISTS public.historico_config_chamadas_llm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id text NOT NULL REFERENCES public.config_chamadas_llm(id) ON DELETE CASCADE,
  versao int NOT NULL,
  modelo text NOT NULL,
  temperatura numeric(3,2) NOT NULL,
  max_tokens int NOT NULL,
  prompt_sistema text NOT NULL,
  gavetas text[] NOT NULL,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  alterado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  motivo text
);

CREATE INDEX IF NOT EXISTS historico_config_chamadas_llm_config_id_idx
  ON public.historico_config_chamadas_llm (config_id, versao DESC);

COMMENT ON TABLE public.historico_config_chamadas_llm IS
  'Histórico de versões de config_chamadas_llm. Trigger snapshota a versão atual antes de cada UPDATE.';

-- Trigger: atualiza atualizado_em + incrementa versão + snapshot histórico
CREATE OR REPLACE FUNCTION public.tg_config_chamadas_llm_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- snapshot da versão antiga
    INSERT INTO public.historico_config_chamadas_llm
      (config_id, versao, modelo, temperatura, max_tokens, prompt_sistema, gavetas, alterado_em, alterado_por)
    VALUES
      (OLD.id, OLD.versao, OLD.modelo, OLD.temperatura, OLD.max_tokens, OLD.prompt_sistema, OLD.gavetas, now(), NEW.atualizado_por);

    NEW.versao := OLD.versao + 1;
    NEW.atualizado_em := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_config_chamadas_llm_snapshot ON public.config_chamadas_llm;
CREATE TRIGGER tg_config_chamadas_llm_snapshot
  BEFORE UPDATE ON public.config_chamadas_llm
  FOR EACH ROW EXECUTE FUNCTION public.tg_config_chamadas_llm_snapshot();

-- RLS
ALTER TABLE public.config_chamadas_llm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_config_chamadas_llm ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT/UPDATE só pra platform_admin (via user_roles)
CREATE POLICY config_chamadas_admin_all ON public.config_chamadas_llm
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role = 'platform_admin'
    )
  );

CREATE POLICY historico_config_chamadas_admin_select ON public.historico_config_chamadas_llm
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role = 'platform_admin'
    )
  );

-- Seed das 4 chamadas iniciais do motor
INSERT INTO public.config_chamadas_llm (id, nome, descricao, modelo, temperatura, max_tokens, prompt_sistema, gavetas)
VALUES
  ('porteiro',
   'Porteiro',
   'Classifica intenção do lead e decide o fluxo. Modelo rápido e barato.',
   'google/gemini-2.5-flash-lite',
   0.1,
   512,
   E'Você é o Porteiro. Analise a mensagem do lead e classifique a intenção.\n\nIntenções possíveis:\n- saudacao\n- duvida_servico\n- objecao_preco\n- agendamento\n- reclamacao\n- fora_de_escopo\n\nResponda SOMENTE com o JSON: {"intencao": "...", "confianca": 0.0}',
   '{}'),
  ('sintese',
   'Síntese',
   'Redige a resposta final ao lead com base nos blocos recuperados.',
   'google/gemini-2.5-pro',
   0.7,
   1024,
   E'Você é {{nome_agente}}, {{persona}}.\n\nResponda ao lead de forma natural, empática e objetiva.\nUse as informações dos blocos de conhecimento abaixo.\nNão invente preços ou datas.\n\n<blocos>\n{{blocos_recuperados}}\n</blocos>\n\n<historico>\n{{historico_conversa}}\n</historico>',
   ARRAY['blocos_conhecimento','blocos_comportamento','blocos_humanizacao','blocos_meta','regras_operacionais_blocos']),
  ('extrator',
   'Extrator',
   'Extrai dados estruturados da conversa pra preencher a ficha do lead.',
   'google/gemini-2.5-flash',
   0.0,
   256,
   E'Extraia os dados da conversa e retorne JSON.\n\nCampos esperados:\n{{campos_ficha}}\n\nConversa:\n{{historico_conversa}}\n\nResponda SOMENTE com o JSON, sem explicações.',
   '{}'),
  ('mentor',
   'Mentor',
   'Analisa a conversa e sugere melhorias pro agente (modo curadoria).',
   'google/gemini-2.5-pro',
   0.4,
   2048,
   E'Você é o Mentor. Analise a conversa entre lead e agente.\n\nAvalie:\n1. Adequação da persona\n2. Uso correto dos blocos de conhecimento\n3. Oportunidades perdidas\n4. Sugestões de melhoria\n\nConversa:\n{{historico_conversa}}\n\nRetorne um relatório estruturado em PT-BR.',
   ARRAY['blocos_comportamento','blocos_meta'])
ON CONFLICT (id) DO NOTHING;
;

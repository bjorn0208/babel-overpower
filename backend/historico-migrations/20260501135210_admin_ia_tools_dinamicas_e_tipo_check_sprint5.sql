-- Sprint 5 · tabela admin_ia_tools_dinamicas + expansão do CHECK em admin_ia_propostas.tipo

CREATE TABLE IF NOT EXISTS public.admin_ia_tools_dinamicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text NOT NULL,
  schema_input jsonb NOT NULL,
  executor_sql text,
  executor_rpc text,
  tipo text NOT NULL CHECK (tipo IN ('select','rpc')),
  ativa boolean NOT NULL DEFAULT true,
  criada_por uuid REFERENCES auth.users(id),
  criada_em timestamptz NOT NULL DEFAULT now(),
  aprovada_em timestamptz,
  aprovada_por uuid REFERENCES auth.users(id),
  vezes_usada int NOT NULL DEFAULT 0,
  ultimo_uso timestamptz
);

ALTER TABLE public.admin_ia_tools_dinamicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_ia_tools_dinamicas_admin_all ON public.admin_ia_tools_dinamicas;
CREATE POLICY admin_ia_tools_dinamicas_admin_all
  ON public.admin_ia_tools_dinamicas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role='platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role='platform_admin'));

-- Expande CHECK em admin_ia_propostas.tipo pra incluir tool_admin + chunk_plataforma_<gaveta> + calibracao_threshold + vocabulario
ALTER TABLE public.admin_ia_propostas DROP CONSTRAINT IF EXISTS admin_ia_propostas_tipo_check;
ALTER TABLE public.admin_ia_propostas ADD CONSTRAINT admin_ia_propostas_tipo_check
  CHECK (tipo IN (
    'rag_admin_chunk', 'rag_admin_chunk_edit',
    'chunk_platform', 'chunk_platform_edit',
    'chunk_knowledge', 'chunk_behavior', 'chunk_trigger', 'chunk_human', 'chunk_variation',
    'chunk_meta', 'chunk_procedural', 'chunk_emocao', 'chunk_prova_social', 'chunk_manipulacao',
    'chunk_diretriz_bolha', 'chunk_automacao', 'chunk_acao_pausa', 'chunk_regras_operacionais',
    'mudanca_fase', 'mudanca_pipeline',
    'vocab_canonico', 'vocab_alias', 'vocabulario',
    'automacao_semantica', 'threshold', 'calibracao_threshold',
    'override_tenant', 'cronjob', 'tool_admin'
  ));
;

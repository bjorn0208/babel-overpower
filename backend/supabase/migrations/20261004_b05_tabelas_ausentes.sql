-- B-05: Tabelas ausentes que quebram funções SQL em produção
-- Ref: AUDITORIA-BACK.md §B-05

-- 1. repropostas_lead_campanha (usada por enviar_reproposta e obter_metricas_campanha)
CREATE TABLE IF NOT EXISTS public.repropostas_lead_campanha (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  campaign_lead_id uuid NOT NULL REFERENCES public.leads_campanha(id) ON DELETE CASCADE,
  texto text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_repropostas_campaign_lead ON public.repropostas_lead_campanha(campaign_lead_id);
ALTER TABLE public.repropostas_lead_campanha ENABLE ROW LEVEL SECURITY;

-- 2. produto_template_conhecimento (usada por integracao_provisionar_conta)
CREATE TABLE IF NOT EXISTS public.produto_template_conhecimento (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  produto_template_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'texto',
  titulo text NOT NULL,
  conteudo text NOT NULL DEFAULT '',
  ordem integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_prod_tmpl_conh_template ON public.produto_template_conhecimento(produto_template_id);

-- 3. Colunas ausentes em leads (product, cargo_ativo_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='product') THEN
    ALTER TABLE public.leads ADD COLUMN product text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='cargo_ativo_id') THEN
    ALTER TABLE public.leads ADD COLUMN cargo_ativo_id uuid;
  END IF;
END $$;

-- 4. Coluna token em meta_indicacao_campanha (get_indicador_publico usa token, tabela tem chave_publica)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meta_indicacao_campanha' AND column_name='token') THEN
    ALTER TABLE public.meta_indicacao_campanha ADD COLUMN token uuid DEFAULT gen_random_uuid();
    CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_indicacao_token ON public.meta_indicacao_campanha(token);
  END IF;
END $$;

-- 5. Colunas ausentes em blocos_conhecimento (criado_em, atualizado_em, created_by, ativa)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blocos_conhecimento' AND column_name='criado_em') THEN
    ALTER TABLE public.blocos_conhecimento ADD COLUMN criado_em timestamptz DEFAULT now() NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blocos_conhecimento' AND column_name='atualizado_em') THEN
    ALTER TABLE public.blocos_conhecimento ADD COLUMN atualizado_em timestamptz DEFAULT now() NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blocos_conhecimento' AND column_name='created_by') THEN
    ALTER TABLE public.blocos_conhecimento ADD COLUMN created_by uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blocos_conhecimento' AND column_name='ativa') THEN
    ALTER TABLE public.blocos_conhecimento ADD COLUMN ativa boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- 6. Coluna chunks_usados em prompts_mensagem (obter_prompts_conversa referencia)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prompts_mensagem' AND column_name='chunks_usados') THEN
    ALTER TABLE public.prompts_mensagem ADD COLUMN chunks_usados jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;
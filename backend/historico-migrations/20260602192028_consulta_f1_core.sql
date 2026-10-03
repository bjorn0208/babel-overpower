-- App Consulta F1 — núcleo: a consulta + config do tenant

-- 3.3 Consultas (espelha contratos)
CREATE TABLE IF NOT EXISTS public.consultas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo_id uuid REFERENCES public.consultas_tipos(id),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  agente_id uuid,
  chave_publica uuid NOT NULL DEFAULT gen_random_uuid(),
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','link')),
  tipo_doc text CHECK (tipo_doc IN ('cpf','cnpj','placa','chassi')),
  documento text,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aguardando_pagamento','comprovante_enviado','validando','fila_revisao','consultando','concluida','erro','recusada')),
  custo numeric(10,2),                 -- snapshot do custo do tipo (debitado do tenant)
  preco numeric(10,2),                 -- preço cobrado do cliente final (tenant define)
  dados_cliente jsonb NOT NULL DEFAULT '{}',
  campos_obrigatorios jsonb NOT NULL DEFAULT '[]',
  instrucao_selfie text,
  url_selfie text,
  url_documento text,
  url_comprovante_pagamento text,
  chave_pix text,
  validacao_comprovante jsonb NOT NULL DEFAULT '{}',  -- snapshot das regras de validação
  comprovante_analise jsonb,                          -- saída da visão: dados + confiança + ok/falha por critério
  resultado jsonb,                                    -- resposta crua da API (PII)
  resultado_path text,                                -- snapshot no bucket privado
  pdf_url text,
  titulo text,
  logo_url text,
  banner_url text,
  nome_empresa text,
  descricao_empresa text,
  cor_pagina text DEFAULT '#4f46e5',
  aviso_final text,
  produto_oferta_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  consultada_em timestamptz,
  erro_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT consultas_chave_publica_unique UNIQUE (chave_publica)
);
CREATE INDEX IF NOT EXISTS consultas_tenant_idx ON public.consultas (tenant_id);
CREATE INDEX IF NOT EXISTS consultas_lead_idx ON public.consultas (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS consultas_tipo_idx ON public.consultas (tipo_id);
CREATE INDEX IF NOT EXISTS consultas_tenant_status_idx ON public.consultas (tenant_id, status) WHERE deleted_at IS NULL;

ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_gere_proprias_consultas" ON public.consultas;
CREATE POLICY "tenant_gere_proprias_consultas" ON public.consultas
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

-- 15.2 Config do tenant (defaults reutilizáveis + gate de venda pelo agente)
CREATE TABLE IF NOT EXISTS public.consultas_config_tenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  agente_pode_vender boolean NOT NULL DEFAULT false,   -- GATE: liga tool + RAG juntos
  produto_oferta_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  tipo_padrao_id uuid REFERENCES public.consultas_tipos(id) ON DELETE SET NULL,
  logo_url text,
  banner_url text,
  chave_pix text,
  campos_formulario jsonb NOT NULL DEFAULT '[]',       -- campos + ativo/inativo
  selfie_ativo boolean NOT NULL DEFAULT false,
  doc_foto_ativo boolean NOT NULL DEFAULT false,
  validacao_comprovante jsonb NOT NULL DEFAULT '{}',   -- critérios + modo (auto/fila/manual) + limite confiança
  aviso_final text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultas_config_tenant_produto_idx ON public.consultas_config_tenant (produto_oferta_id) WHERE produto_oferta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS consultas_config_tenant_tipo_idx ON public.consultas_config_tenant (tipo_padrao_id) WHERE tipo_padrao_id IS NOT NULL;

ALTER TABLE public.consultas_config_tenant ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_gere_propria_config" ON public.consultas_config_tenant;
CREATE POLICY "tenant_gere_propria_config" ON public.consultas_config_tenant
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));
;

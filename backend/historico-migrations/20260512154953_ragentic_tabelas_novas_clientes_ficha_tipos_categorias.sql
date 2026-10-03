-- ---- clientes (CRM Ragentic; separado de leads do Real Connect) ----------
CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES public.agentes(id) ON DELETE SET NULL,
  nome text NOT NULL DEFAULT '',
  telefone text,
  email text,
  fonte text,
  tags text[] DEFAULT '{}'::text[],
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS clientes_owner_idx ON public.clientes (owner_id, atualizado_em DESC);
CREATE INDEX IF NOT EXISTS clientes_agente_idx ON public.clientes (agente_id);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clientes_tenant ON public.clientes;
CREATE POLICY clientes_tenant ON public.clientes FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

-- ---- ficha_do_lead -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ficha_do_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES public.agentes(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] DEFAULT '{}'::text[],
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ficha_conversa_idx ON public.ficha_do_lead (conversa_id);
CREATE INDEX IF NOT EXISTS ficha_cliente_idx ON public.ficha_do_lead (cliente_id);
ALTER TABLE public.ficha_do_lead ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ficha_via_conversa ON public.ficha_do_lead;
CREATE POLICY ficha_via_conversa ON public.ficha_do_lead FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversas c WHERE c.id = conversa_id AND c.tenant_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversas c WHERE c.id = conversa_id AND c.tenant_id = (select auth.uid())));

-- ---- tipos_de_produto ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tipos_de_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  categorias text[] DEFAULT '{}'::text[],
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tipos_de_produto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tipos_de_produto_leitura_publica ON public.tipos_de_produto;
CREATE POLICY tipos_de_produto_leitura_publica ON public.tipos_de_produto FOR SELECT TO authenticated USING (ativo = true);
DROP POLICY IF EXISTS tipos_de_produto_admin ON public.tipos_de_produto;
CREATE POLICY tipos_de_produto_admin ON public.tipos_de_produto FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

-- ---- categorias_produto --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categorias_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome text NOT NULL,
  slug text NOT NULL,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slug)
);
CREATE INDEX IF NOT EXISTS categorias_produto_owner_idx ON public.categorias_produto (owner_id, ordem);
ALTER TABLE public.categorias_produto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categorias_produto_tenant ON public.categorias_produto;
CREATE POLICY categorias_produto_tenant ON public.categorias_produto FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

-- ---- contrato_itens ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  nome_snapshot text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  preco_unitario numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contrato_itens_contrato_idx ON public.contrato_itens (contrato_id, ordem);
ALTER TABLE public.contrato_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contrato_itens_via_contrato ON public.contrato_itens;
CREATE POLICY contrato_itens_via_contrato ON public.contrato_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos c WHERE c.id = contrato_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contratos c WHERE c.id = contrato_id));

-- ---- produtos: colunas adicionais ----------------------------------------
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS agente_id uuid REFERENCES public.agentes(id) ON DELETE SET NULL;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS tipo_produto_id uuid REFERENCES public.tipos_de_produto(id) ON DELETE SET NULL;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS nicho_id uuid REFERENCES public.nichos(id) ON DELETE SET NULL;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS descricao_curta text;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS palavras_chave text[] DEFAULT '{}'::text[];
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS produtos_owner_idx ON public.produtos (owner_id);
CREATE INDEX IF NOT EXISTS produtos_agente_idx ON public.produtos (agente_id);
;

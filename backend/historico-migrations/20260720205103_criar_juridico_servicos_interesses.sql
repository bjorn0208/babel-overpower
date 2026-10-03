-- App Juridico — catálogo de serviços jurídicos (admin cadastra) + interesses dos tenants.
-- Fluxo letra C: tenant clica "tenho interesse", vira lead na lista do admin. Sem cobrança.

-- 1. Serviços jurídicos (catálogo do admin)
CREATE TABLE IF NOT EXISTS public.juridico_servicos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  preco numeric NULL,
  is_active boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT juridico_servicos_pkey PRIMARY KEY (id),
  CONSTRAINT juridico_servicos_preco_nao_negativo CHECK (preco IS NULL OR preco >= 0)
);

COMMENT ON TABLE public.juridico_servicos IS 'Catálogo de serviços jurídicos do app Juridico. Admin cadastra; tenant vê vitrine no app user. preco NULL = sob consulta. Soft delete via deleted_at.';

ALTER TABLE public.juridico_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_read_juridico_servicos ON public.juridico_servicos;
CREATE POLICY user_read_juridico_servicos ON public.juridico_servicos
  FOR SELECT TO authenticated
  USING (is_active = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS admin_all_juridico_servicos ON public.juridico_servicos;
CREATE POLICY admin_all_juridico_servicos ON public.juridico_servicos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'));

DROP POLICY IF EXISTS service_role_full_juridico_servicos ON public.juridico_servicos;
CREATE POLICY service_role_full_juridico_servicos ON public.juridico_servicos
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_juridico_servicos_ativos
  ON public.juridico_servicos (ordem, nome)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_juridico_servicos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_juridico_servicos_updated_at ON public.juridico_servicos;
CREATE TRIGGER trg_juridico_servicos_updated_at
  BEFORE UPDATE ON public.juridico_servicos
  FOR EACH ROW EXECUTE FUNCTION public.tg_juridico_servicos_updated_at();

-- 2. Interesses (tenant clicou "tenho interesse")
CREATE TABLE IF NOT EXISTS public.juridico_interesses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  servico_id uuid NOT NULL,
  observacao text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'novo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT juridico_interesses_pkey PRIMARY KEY (id),
  CONSTRAINT juridico_interesses_user_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT juridico_interesses_servico_fkey FOREIGN KEY (servico_id) REFERENCES public.juridico_servicos(id) ON DELETE CASCADE,
  CONSTRAINT juridico_interesses_status_check CHECK (status IN ('novo', 'contatado', 'fechado', 'descartado')),
  CONSTRAINT juridico_interesses_unique UNIQUE (user_id, servico_id)
);

COMMENT ON TABLE public.juridico_interesses IS 'Interesses em serviços jurídicos (app Juridico). 1 row por par (tenant, serviço). Status: novo → contatado → fechado | descartado. Admin gerencia na aba Interessados.';

ALTER TABLE public.juridico_interesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_insert_proprio_interesse ON public.juridico_interesses;
CREATE POLICY user_insert_proprio_interesse ON public.juridico_interesses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_read_proprios_interesses ON public.juridico_interesses;
CREATE POLICY user_read_proprios_interesses ON public.juridico_interesses
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS admin_all_juridico_interesses ON public.juridico_interesses;
CREATE POLICY admin_all_juridico_interesses ON public.juridico_interesses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'));

DROP POLICY IF EXISTS service_role_full_juridico_interesses ON public.juridico_interesses;
CREATE POLICY service_role_full_juridico_interesses ON public.juridico_interesses
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_juridico_interesses_user ON public.juridico_interesses (user_id);
CREATE INDEX IF NOT EXISTS idx_juridico_interesses_servico ON public.juridico_interesses (servico_id);
CREATE INDEX IF NOT EXISTS idx_juridico_interesses_status ON public.juridico_interesses (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_juridico_interesses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_juridico_interesses_updated_at ON public.juridico_interesses;
CREATE TRIGGER trg_juridico_interesses_updated_at
  BEFORE UPDATE ON public.juridico_interesses
  FOR EACH ROW EXECUTE FUNCTION public.tg_juridico_interesses_updated_at();

-- 3. Seed dos 4 serviços iniciais (preco NULL = sob consulta; admin edita depois)
INSERT INTO public.juridico_servicos (nome, descricao, ordem)
SELECT v.nome, v.descricao, v.ordem
FROM (VALUES
  ('Remoção de Apontamentos de Dívidas', 'Retirada de apontamentos de dívidas nos órgãos de proteção ao crédito.', 1),
  ('Remoção de Histórico Bacen', 'Limpeza do histórico de registros junto ao Banco Central (Bacen).', 2),
  ('Processo Funcionário', 'Ação judicial envolvendo funcionário da empresa.', 3),
  ('Processo Clientes', 'Ação judicial envolvendo clientes da empresa.', 4)
) AS v(nome, descricao, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.juridico_servicos s WHERE s.nome = v.nome);

-- 4. App Juridico no catálogo da Loja (grátis, global — sem vínculo em aplicativos_nicho)
INSERT INTO public.loja_aplicativos (slug, nome, descricao, icone, categoria, preco_mensal, is_active, ordem)
SELECT 'juridico', 'Jurídico', 'Serviços jurídicos pra sua empresa: catálogo com valores e pedido de contato.', 'app:juridico', 'juridico', NULL, true, 13
WHERE NOT EXISTS (SELECT 1 FROM public.loja_aplicativos la WHERE la.slug = 'juridico');
;

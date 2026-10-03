-- Árvore de categorias do caixa (2 níveis: raiz → subcategoria).
CREATE TABLE IF NOT EXISTS public.categorias_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 60),
  categoria_pai_id uuid REFERENCES public.categorias_financeiras(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.categorias_financeiras IS 'Categorias e subcategorias do caixa do tenant (2 níveis). O agente Financeiro distribui os lançamentos; cria subcategoria sozinho (anti-duplicata) e raiz só com confirmação do dono.';

-- Nome único por nível (raiz usa uuid zero como "pai" no índice)
CREATE UNIQUE INDEX IF NOT EXISTS uk_categorias_financeiras_nivel_nome
  ON public.categorias_financeiras (tenant_id, coalesce(categoria_pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categorias_financeiras_tenant
  ON public.categorias_financeiras (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categorias_financeiras_pai
  ON public.categorias_financeiras (categoria_pai_id) WHERE categoria_pai_id IS NOT NULL;

ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'categorias_financeiras_tenant_all') THEN
    CREATE POLICY "categorias_financeiras_tenant_all" ON public.categorias_financeiras
      FOR ALL TO authenticated
      USING (tenant_id = (select auth.uid()))
      WITH CHECK (tenant_id = (select auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_categorias_financeiras_atualizado ON public.categorias_financeiras;
CREATE TRIGGER trg_categorias_financeiras_atualizado
  BEFORE UPDATE ON public.categorias_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- Lançamento aponta pra (sub)categoria; campo texto `categoria` vira o rótulo "Raiz > Sub"
ALTER TABLE public.movimentos_financeiros
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_movimentos_financeiros_categoria
  ON public.movimentos_financeiros (categoria_id) WHERE categoria_id IS NOT NULL;

-- Kit básico no primeiro uso (front chama sem arg; edge service_role passa o tenant)
CREATE OR REPLACE FUNCTION public.garantir_categorias_padrao(p_tenant_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid := COALESCE((SELECT auth.uid()), p_tenant_id);
  v_qtd int := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant obrigatório';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categorias_financeiras WHERE tenant_id = v_tenant AND deleted_at IS NULL) THEN
    INSERT INTO public.categorias_financeiras (tenant_id, nome)
    VALUES (v_tenant, 'Casa'), (v_tenant, 'Empresa'), (v_tenant, 'Transporte'),
           (v_tenant, 'Alimentação'), (v_tenant, 'Contas'), (v_tenant, 'Investimento');
    GET DIAGNOSTICS v_qtd = ROW_COUNT;
  END IF;
  RETURN v_qtd;
END;
$$;

-- Realtime pra seção de categorias do app
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='categorias_financeiras') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.categorias_financeiras;
  END IF;
END $$;
;

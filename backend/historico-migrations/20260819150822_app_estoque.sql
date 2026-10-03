-- App Estoque — itens + movimentações + RPC atômica (2026-08-19)
CREATE TABLE IF NOT EXISTS public.estoque_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome text NOT NULL,
  sku text,
  categoria text,
  quantidade integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  quantidade_minima integer NOT NULL DEFAULT 0 CHECK (quantidade_minima >= 0),
  preco_custo_centavos integer CHECK (preco_custo_centavos IS NULL OR preco_custo_centavos >= 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.estoque_itens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estoque_itens' AND policyname = 'estoque_itens_tenant_all') THEN
    CREATE POLICY estoque_itens_tenant_all ON public.estoque_itens
      FOR ALL TO authenticated
      USING (tenant_id = (SELECT auth.uid()))
      WITH CHECK (tenant_id = (SELECT auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_estoque_itens_tenant_vivos ON public.estoque_itens (tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.estoque_itens(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  quantidade integer NOT NULL CHECK (quantidade >= 0),
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estoque_movimentacoes' AND policyname = 'estoque_movimentacoes_tenant_all') THEN
    CREATE POLICY estoque_movimentacoes_tenant_all ON public.estoque_movimentacoes
      FOR ALL TO authenticated
      USING (tenant_id = (SELECT auth.uid()))
      WITH CHECK (tenant_id = (SELECT auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_tenant ON public.estoque_movimentacoes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_item ON public.estoque_movimentacoes (item_id, created_at DESC);

-- Movimentação atômica: atualiza a quantidade E grava o histórico numa transação.
-- INVOKER: RLS do tenant vale dentro (só mexe no que é dele).
CREATE OR REPLACE FUNCTION public.movimentar_estoque(
  p_item_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_motivo text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_nova integer;
BEGIN
  IF p_tipo NOT IN ('entrada', 'saida', 'ajuste') THEN
    RAISE EXCEPTION 'tipo de movimentação inválido: %', p_tipo;
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 0 THEN
    RAISE EXCEPTION 'quantidade inválida';
  END IF;
  UPDATE public.estoque_itens
  SET quantidade = CASE p_tipo
        WHEN 'entrada' THEN quantidade + p_quantidade
        WHEN 'saida' THEN quantidade - p_quantidade
        ELSE p_quantidade
      END,
      updated_at = now()
  WHERE id = p_item_id AND deleted_at IS NULL
  RETURNING quantidade INTO v_nova;
  IF v_nova IS NULL THEN
    RAISE EXCEPTION 'item de estoque não encontrado';
  END IF;
  INSERT INTO public.estoque_movimentacoes (tenant_id, item_id, tipo, quantidade, motivo)
  SELECT tenant_id, id, p_tipo, p_quantidade, p_motivo
  FROM public.estoque_itens WHERE id = p_item_id;
  RETURN v_nova;
END;
$$;
;

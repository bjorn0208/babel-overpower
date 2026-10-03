
-- 1) Adicionar coluna criterios_qualificacao na tabela produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS criterios_qualificacao text DEFAULT '';

-- 2) Criar tabela produto_midias para vincular midia a produto
CREATE TABLE IF NOT EXISTS public.produto_midias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  arquivo_url text NOT NULL,
  arquivo_nome text NOT NULL DEFAULT '',
  arquivo_tipo text NOT NULL DEFAULT '',
  descricao text NOT NULL DEFAULT '',
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Index para busca por produto
CREATE INDEX IF NOT EXISTS idx_produto_midias_produto_id ON public.produto_midias(produto_id);

-- 4) RLS
ALTER TABLE public.produto_midias ENABLE ROW LEVEL SECURITY;

-- Select: dono do produto
CREATE POLICY produto_midias_select_own ON public.produto_midias
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_midias.produto_id AND p.user_id = auth.uid()
    )
  );

-- Insert: dono do produto
CREATE POLICY produto_midias_insert_own ON public.produto_midias
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_midias.produto_id AND p.user_id = auth.uid()
    )
  );

-- Update: dono do produto
CREATE POLICY produto_midias_update_own ON public.produto_midias
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_midias.produto_id AND p.user_id = auth.uid()
    )
  );

-- Delete: dono do produto
CREATE POLICY produto_midias_delete_own ON public.produto_midias
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_midias.produto_id AND p.user_id = auth.uid()
    )
  );

-- Admin: acesso total
CREATE POLICY produto_midias_admin_all ON public.produto_midias
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.system_role = 'platform_admin'
    )
  );

;

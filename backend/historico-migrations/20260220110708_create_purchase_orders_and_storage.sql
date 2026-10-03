
-- Tabela de pedidos de compra (usuario envia comprovante PIX)
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('plano', 'pacote_extra', 'plus')),
  item_id UUID NOT NULL,
  item_nome TEXT NOT NULL,
  item_preco NUMERIC NOT NULL DEFAULT 0,
  comprovante_url TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado')),
  observacao_admin TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

-- Admin le tudo
CREATE POLICY "admin_read_purchase_orders" ON purchase_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

-- Admin atualiza tudo
CREATE POLICY "admin_update_purchase_orders" ON purchase_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

-- Usuario le seus proprios pedidos
CREATE POLICY "user_read_own_orders" ON purchase_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Usuario cria seus proprios pedidos
CREATE POLICY "user_insert_own_orders" ON purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Team member le pedidos do parent
CREATE POLICY "team_read_parent_orders" ON purchase_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND parent_user_id = purchase_orders.user_id)
  );

-- Storage bucket para comprovantes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes',
  'comprovantes',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "user_upload_comprovante" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user_read_own_comprovante" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "admin_read_all_comprovantes" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

;

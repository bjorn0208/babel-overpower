-- Bucket público (leitura via CDN — mídia de produto pode aparecer em link de venda).
-- Sem policy SELECT de propósito (evita advisor public_bucket_allows_listing); leitura é via URL pública.
INSERT INTO storage.buckets (id, name, public)
VALUES ('produto-midias', 'produto-midias', true)
ON CONFLICT (id) DO NOTHING;

-- Escrita restrita ao dono: 1ª pasta do path = uid do usuário logado.
-- Path usado pelo front: {uid}/{produto_id}/{ts}.{ext}
CREATE POLICY "produto_midias_obj_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'produto-midias' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "produto_midias_obj_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'produto-midias' AND (storage.foldername(name))[1] = (select auth.uid())::text)
  WITH CHECK (bucket_id = 'produto-midias' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "produto_midias_obj_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'produto-midias' AND (storage.foldername(name))[1] = (select auth.uid())::text);
;

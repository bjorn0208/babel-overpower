-- Fecha o bucket rifas-anexos (12/09). Público só CRIA comprovante em {chave}/comprovante-N.ext;
-- logado só mexe na própria pasta {auth.uid()}/…; edge functions usam service_role.
DROP POLICY IF EXISTS "rifas_anon_delete" ON storage.objects;
DROP POLICY IF EXISTS "rifas_anon_select" ON storage.objects;
DROP POLICY IF EXISTS "rifas_anon_update" ON storage.objects;
DROP POLICY IF EXISTS "rifas_anon_upload" ON storage.objects;
DROP POLICY IF EXISTS "rifas_authenticated_delete" ON storage.objects;
DROP POLICY IF EXISTS "rifas_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "rifas_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "rifas_authenticated_upload" ON storage.objects;
CREATE POLICY "rifas_comprovante_publico_upload" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'rifas-anexos' AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/comprovante-[0-9]+\.[A-Za-z0-9]{1,8}$');
CREATE POLICY "rifas_dono_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rifas-anexos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "rifas_dono_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rifas-anexos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "rifas_dono_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'rifas-anexos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'rifas-anexos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "rifas_dono_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rifas-anexos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
;

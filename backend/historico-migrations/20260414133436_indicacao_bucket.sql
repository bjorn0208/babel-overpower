INSERT INTO storage.buckets (id, name, public)
VALUES ('indicacao-assets', 'indicacao-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Tenant uploads na propria pasta indicacao"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'indicacao-assets' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

CREATE POLICY "Tenant le da propria pasta indicacao"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'indicacao-assets' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

CREATE POLICY "Tenant atualiza arquivos da propria pasta indicacao"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'indicacao-assets' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

CREATE POLICY "Tenant deleta arquivos da propria pasta indicacao"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'indicacao-assets' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

CREATE POLICY "Publico le assets indicacao"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'indicacao-assets');
;

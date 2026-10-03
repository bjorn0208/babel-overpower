-- Admin pode fazer upload/update/delete de avatars de qualquer usuario
CREATE POLICY "Admin can upload any avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
);

CREATE POLICY "Admin can update any avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
);

CREATE POLICY "Admin can delete any avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
);
;

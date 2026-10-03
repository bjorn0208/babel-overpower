-- Bucket privado pra anexos do Admin IA (imagem, PDF, áudio)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('admin-ia-uploads', 'admin-ia-uploads', false, 52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','audio/webm','audio/mpeg','audio/mp4','audio/wav','text/plain','text/markdown'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies RLS: só admin pode ler/escrever
DROP POLICY IF EXISTS "admin_ia_uploads_admin_read" ON storage.objects;
DROP POLICY IF EXISTS "admin_ia_uploads_admin_write" ON storage.objects;

CREATE POLICY "admin_ia_uploads_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'admin-ia-uploads'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin')
  );

CREATE POLICY "admin_ia_uploads_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'admin-ia-uploads'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin')
  );
;

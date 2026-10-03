
-- Bucket curadoria-arquivos — espelhado do admin-ia-arquivos.
-- Anexos do chat Curadoria: pdf (vira contrato/base RAG), audio (vira conhecimento), imagem (referencia visual).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'curadoria-arquivos',
  'curadoria-arquivos',
  false,
  52428800,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'audio/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg',
    'video/mp4','video/webm',
    'text/plain','text/markdown','text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Policies storage.objects pro bucket
-- platform_admin tem acesso total
CREATE POLICY "curadoria_arquivos_admin_full"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'curadoria-arquivos'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND system_role = 'platform_admin')
)
WITH CHECK (
  bucket_id = 'curadoria-arquivos'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND system_role = 'platform_admin')
);

-- tenant impersonado le seus proprios arquivos (path: curadoria-arquivos/{tenant_id}/...)
CREATE POLICY "curadoria_arquivos_tenant_le_proprio"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'curadoria-arquivos'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

;

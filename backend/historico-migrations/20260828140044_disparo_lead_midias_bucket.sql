-- Bucket de mídia do composer de Disparo Fixo (Mentor de Disparo). Nenhum
-- bucket existente aceita vídeo (marketing-posts é só image/png,jpeg,webp,
-- 10MB) — o disparo fixo pode mandar foto OU vídeo, então precisa de bucket
-- próprio. Mesmo padrão de policy (tenant-scoped por pasta) de
-- marketing_posts_*.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'disparo-lead-midias',
  'disparo-lead-midias',
  true,
  31457280, -- 30MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "disparo_lead_midias_insert_own" ON storage.objects;
CREATE POLICY "disparo_lead_midias_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'disparo-lead-midias'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "disparo_lead_midias_select_own" ON storage.objects;
CREATE POLICY "disparo_lead_midias_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'disparo-lead-midias'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "disparo_lead_midias_delete_own" ON storage.objects;
CREATE POLICY "disparo_lead_midias_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'disparo-lead-midias'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "disparo_lead_midias_service_full" ON storage.objects;
CREATE POLICY "disparo_lead_midias_service_full" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'disparo-lead-midias')
  WITH CHECK (bucket_id = 'disparo-lead-midias');

;

-- Add primary_color column to platform_settings
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS primary_color text DEFAULT 'indigo';

-- Create logos storage bucket (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: anyone can read logos
CREATE POLICY "logos_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'logos');

-- Storage policy: only admins can upload logos
CREATE POLICY "logos_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

-- Storage policy: only admins can update logos
CREATE POLICY "logos_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

-- Storage policy: only admins can delete logos
CREATE POLICY "logos_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );
;

CREATE POLICY "admin_insert_agent_files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agent-files'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.system_role = 'platform_admin')
  );

CREATE POLICY "admin_update_agent_files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'agent-files'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.system_role = 'platform_admin')
  );
;


-- Policies para o bucket agent-files (base de conhecimento do agente)
CREATE POLICY "auth_read_agent_files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'agent-files');
CREATE POLICY "auth_upload_agent_files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'agent-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "auth_update_agent_files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'agent-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "auth_delete_agent_files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'agent-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "anon_read_agent_files" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'agent-files');

;

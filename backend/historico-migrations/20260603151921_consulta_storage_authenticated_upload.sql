-- Permite o TENANT logado subir o comprovante de recarga no bucket consultas-anexos
-- (o link público usa anon; faltava o caminho authenticated pra recarga da carteira).
CREATE POLICY "consulta_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'consultas-anexos');
;

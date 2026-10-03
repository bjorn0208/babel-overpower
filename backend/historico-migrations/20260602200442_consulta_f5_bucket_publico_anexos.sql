-- Anexos do cliente (selfie/doc/comprovante) em bucket público pra preview funcionar,
-- espelhando o padrão do contrato (contract-signatures). O dado SENSÍVEL (resultado de
-- dívida + PDF) NUNCA vai pro bucket — fica no jsonb, servido por obter_consulta_por_token
-- apenas quando status='concluida'. Endurecimento (signed URL) do PDF do resultado = F6.
UPDATE storage.buckets SET public = true WHERE id = 'consultas-anexos';

-- Leitura pública dos anexos (igual ao bucket de contrato)
DROP POLICY IF EXISTS "consulta_leitura_publica_anexos" ON storage.objects;
CREATE POLICY "consulta_leitura_publica_anexos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'consultas-anexos');
;

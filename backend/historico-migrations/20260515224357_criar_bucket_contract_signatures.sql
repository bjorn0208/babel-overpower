
-- Bucket contract-signatures: nunca foi criado, embora as policies cs_anon_insert /
-- cs_auth_insert / cs_public_read e o frontend (pages/public/Contrato.tsx) já o usem.
-- Sem o bucket, todo upload de selfie/documento/assinatura/comprovante da tela
-- pública de assinatura falhava calado e o contrato era assinado sem anexo.
-- Espelha a config do bucket assinaturas-contrato (publico, limite 10MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contract-signatures', 'contract-signatures', true, 10485760, NULL)
ON CONFLICT (id) DO NOTHING;

;

-- Onda 3 do app-contratos-ragentic: bucket pros anexos do agente mestre
-- (txt/pdf/docx que viram template ou contrato livre).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mestre-anexos', 'mestre-anexos', false, 8388608,
  ARRAY['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
) ON CONFLICT (id) DO NOTHING;

-- Policies: tenant lê/escreve só sua própria pasta (1º segmento = auth.uid()).

DROP POLICY IF EXISTS mestre_anexos_owner_select ON storage.objects;
CREATE POLICY mestre_anexos_owner_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'mestre-anexos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS mestre_anexos_owner_insert ON storage.objects;
CREATE POLICY mestre_anexos_owner_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'mestre-anexos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS mestre_anexos_owner_delete ON storage.objects;
CREATE POLICY mestre_anexos_owner_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'mestre-anexos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

;

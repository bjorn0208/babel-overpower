-- Bucket `anexos-chat` (público, leitura via CDN — NÃO criar SELECT pra não
-- disparar public_bucket_allows_listing). Faltava policy de upload: sem ela
-- o envio de mídia pelo painel (app Conversas) era bloqueado por RLS.
-- Escopo por pasta = uid do usuário logado (1ª pasta do path), padrão usado
-- em avatars/agent-files/comprovantes. Idempotente (drop+create).
-- DOWN: DROP POLICY "anexos_chat_tenant_insert" ON storage.objects;
--       DROP POLICY "anexos_chat_tenant_delete" ON storage.objects;

DROP POLICY IF EXISTS "anexos_chat_tenant_insert" ON storage.objects;
CREATE POLICY "anexos_chat_tenant_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'anexos-chat'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "anexos_chat_tenant_delete" ON storage.objects;
CREATE POLICY "anexos_chat_tenant_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'anexos-chat'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
;

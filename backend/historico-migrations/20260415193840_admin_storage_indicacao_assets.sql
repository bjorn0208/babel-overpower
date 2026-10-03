-- Admin platform pode fazer INSERT/UPDATE/DELETE em indicacao-assets
-- (necessário pra uploads via impersonação: pasta é tenant_id mas JWT continua do admin)

CREATE POLICY "platform_admin_insert_indicacao_assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'indicacao-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.system_role = 'platform_admin'
    )
  );

CREATE POLICY "platform_admin_update_indicacao_assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'indicacao-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.system_role = 'platform_admin'
    )
  );

CREATE POLICY "platform_admin_delete_indicacao_assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'indicacao-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.system_role = 'platform_admin'
    )
  );
;

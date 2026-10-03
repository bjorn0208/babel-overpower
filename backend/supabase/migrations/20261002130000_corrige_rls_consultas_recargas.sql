-- consultas_recargas: as políticas do tenant exigiam status = 'pendente', mas o CHECK da tabela só aceita
-- ('aguardando','comprovante_enviado','aprovado','recusado') → o tenant nunca conseguia pedir recarga (RLS 42501),
-- nem editar/remover a própria recarga em aberto. E o admin só lia: "Recusar" no painel não tinha efeito.
-- Idempotente.
DROP POLICY IF EXISTS tenant_insere_recarga ON public.consultas_recargas;
CREATE POLICY tenant_insere_recarga ON public.consultas_recargas FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['aguardando','comprovante_enviado'])));
DROP POLICY IF EXISTS tenant_edita_recarga_pendente ON public.consultas_recargas;
CREATE POLICY tenant_edita_recarga_pendente ON public.consultas_recargas FOR UPDATE TO authenticated
  USING ((tenant_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['aguardando','comprovante_enviado'])))
  WITH CHECK ((tenant_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['aguardando','comprovante_enviado'])));
DROP POLICY IF EXISTS tenant_remove_recarga_pendente ON public.consultas_recargas;
CREATE POLICY tenant_remove_recarga_pendente ON public.consultas_recargas FOR DELETE TO authenticated
  USING ((tenant_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['aguardando','comprovante_enviado'])));
DROP POLICY IF EXISTS admin_atualiza_recargas ON public.consultas_recargas;
CREATE POLICY admin_atualiza_recargas ON public.consultas_recargas FOR UPDATE TO authenticated
  USING ((SELECT public.eh_admin_plataforma())) WITH CHECK ((SELECT public.eh_admin_plataforma()));

-- B1 (auditoria hub Conhecimento): o tenant não tinha policy de escrita em
-- blocos_conhecimento (só SELECT). Libera criar/editar (e soft-delete via update)
-- do PRÓPRIO bloco (escopo='tenant', amarrado ao agente do tenant via agentes.user_id).
-- Não toca leitura existente nem blocos global/nicho (escopo travado no WITH CHECK).

CREATE POLICY tenant_insert_blocos_conhecimento ON public.blocos_conhecimento
  FOR INSERT TO authenticated
  WITH CHECK (
    escopo = 'tenant'
    AND agente_id IN (SELECT a.id FROM public.agentes a WHERE a.user_id = (select auth.uid()))
  );

CREATE POLICY tenant_update_blocos_conhecimento ON public.blocos_conhecimento
  FOR UPDATE TO authenticated
  USING (
    escopo = 'tenant'
    AND agente_id IN (SELECT a.id FROM public.agentes a WHERE a.user_id = (select auth.uid()))
  )
  WITH CHECK (
    escopo = 'tenant'
    AND agente_id IN (SELECT a.id FROM public.agentes a WHERE a.user_id = (select auth.uid()))
  );
;

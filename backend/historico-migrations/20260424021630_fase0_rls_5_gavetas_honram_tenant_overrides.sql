-- FASE 0 · Migration 002 · RLS 4 gavetas comportamentais + knowledge_chunks honram tenant_overrides.
-- Motivo: BUG 3 do Plano Execucao.md v2 — tenant desligava chunk global e continuava vendo via SELECT.
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- Preserva: admin_*, service_role_*, tenant_write_* policies intactas.

-- 1) behavior_chunks.tenant_read_chunks
DROP POLICY IF EXISTS tenant_read_chunks ON public.behavior_chunks;
CREATE POLICY tenant_read_chunks ON public.behavior_chunks
  FOR SELECT TO authenticated
  USING (
    ativo = true
    AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (
        SELECT p.nicho_id FROM public.profiles p
        WHERE p.id = (select auth.uid())
      ))
      OR (escopo = 'tenant' AND tenant_id = (select auth.uid()))
      OR (escopo = 'produto' AND tenant_id = (select auth.uid()))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.behavior_chunks_tenant_overrides o
      WHERE o.chunk_id = behavior_chunks.id
        AND o.tenant_id = (select auth.uid())
        AND o.ativo = false
    )
  );

-- 2) trigger_chunks.tenant_read_trigger_chunks
DROP POLICY IF EXISTS tenant_read_trigger_chunks ON public.trigger_chunks;
CREATE POLICY tenant_read_trigger_chunks ON public.trigger_chunks
  FOR SELECT TO authenticated
  USING (
    ativo = true
    AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (
        SELECT p.nicho_id FROM public.profiles p
        WHERE p.id = (select auth.uid())
      ))
      OR (escopo = ANY (ARRAY['tenant','produto']) AND tenant_id = (select auth.uid()))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.trigger_chunks_tenant_overrides o
      WHERE o.chunk_id = trigger_chunks.id
        AND o.tenant_id = (select auth.uid())
        AND o.ativo = false
    )
  );

-- 3) human_chunks.tenant_read_human_chunks
DROP POLICY IF EXISTS tenant_read_human_chunks ON public.human_chunks;
CREATE POLICY tenant_read_human_chunks ON public.human_chunks
  FOR SELECT TO authenticated
  USING (
    ativo = true
    AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (
        SELECT p.nicho_id FROM public.profiles p
        WHERE p.id = (select auth.uid())
      ))
      OR (escopo = ANY (ARRAY['tenant','produto']) AND tenant_id = (select auth.uid()))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.human_chunks_tenant_overrides o
      WHERE o.chunk_id = human_chunks.id
        AND o.tenant_id = (select auth.uid())
        AND o.ativo = false
    )
  );

-- 4) variation_chunks.auth_read_variation
DROP POLICY IF EXISTS auth_read_variation ON public.variation_chunks;
CREATE POLICY auth_read_variation ON public.variation_chunks
  FOR SELECT TO authenticated
  USING (
    ativo = true
    AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (
        SELECT p.nicho_id FROM public.profiles p
        WHERE p.id = (select auth.uid())
      ))
      OR (escopo = 'tenant' AND tenant_id = (select auth.uid()))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.variation_chunks_tenant_overrides o
      WHERE o.chunk_id = variation_chunks.id
        AND o.tenant_id = (select auth.uid())
        AND o.ativo = false
    )
  );

-- 5) knowledge_chunks.user_read_own_chunks — tratamento separado: filtra por user_agents, não tenant_id direto
DROP POLICY IF EXISTS user_read_own_chunks ON public.knowledge_chunks;
CREATE POLICY user_read_own_chunks ON public.knowledge_chunks
  FOR SELECT TO authenticated
  USING (
    ativo = true
    AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (
        SELECT p.nicho_id FROM public.profiles p
        WHERE p.id = (select auth.uid())
      ))
      OR (escopo = 'tenant' AND agent_id IN (
        SELECT ua.id FROM public.user_agents ua
        WHERE ua.user_id = (select auth.uid())
      ))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.knowledge_chunks_tenant_overrides o
      WHERE o.chunk_id = knowledge_chunks.id
        AND o.tenant_id = (select auth.uid())
        AND o.ativo = false
    )
  );
;

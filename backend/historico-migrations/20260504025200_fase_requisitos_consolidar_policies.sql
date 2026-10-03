-- Onda 1 / Projeto: Fase x Requisitos Semanticos
-- Migration: fase_requisitos_consolidar_policies
-- Consolida 3 policies de authenticated em 4 (uma por acao) para:
--   1. Eliminar WARN multiple_permissive_policies (3 policies sobrepostas em SELECT)
--   2. Corrigir vazamento: auth_read_fase_requisitos USING (ativo=true) deixava
--      qualquer authenticated ler requisitos de outros tenants/agentes.
--
-- Apos: SELECT permite ler globais/nicho/produto + tenant proprio + agente proprio.
-- INSERT/UPDATE/DELETE so em tenant proprio OU agente proprio.

DROP POLICY IF EXISTS "auth_read_fase_requisitos"     ON public.fase_requisitos;
DROP POLICY IF EXISTS "tenant_owns_fase_requisitos"   ON public.fase_requisitos;
DROP POLICY IF EXISTS "agent_owner_fase_requisitos"   ON public.fase_requisitos;

CREATE POLICY "select_fase_requisitos"
  ON public.fase_requisitos
  FOR SELECT TO authenticated
  USING (
    ativo = true
    AND (
      escopo IN ('global','nicho','produto')
      OR (escopo = 'tenant' AND tenant_id = (select auth.uid()))
      OR (
        escopo = 'agente'
        AND agent_id IN (
          SELECT id FROM public.user_agents WHERE user_id = (select auth.uid())
        )
      )
    )
  );

CREATE POLICY "insert_fase_requisitos"
  ON public.fase_requisitos
  FOR INSERT TO authenticated
  WITH CHECK (
    (escopo = 'tenant' AND tenant_id = (select auth.uid()))
    OR (
      escopo = 'agente'
      AND agent_id IN (
        SELECT id FROM public.user_agents WHERE user_id = (select auth.uid())
      )
    )
  );

CREATE POLICY "update_fase_requisitos"
  ON public.fase_requisitos
  FOR UPDATE TO authenticated
  USING (
    (escopo = 'tenant' AND tenant_id = (select auth.uid()))
    OR (
      escopo = 'agente'
      AND agent_id IN (
        SELECT id FROM public.user_agents WHERE user_id = (select auth.uid())
      )
    )
  )
  WITH CHECK (
    (escopo = 'tenant' AND tenant_id = (select auth.uid()))
    OR (
      escopo = 'agente'
      AND agent_id IN (
        SELECT id FROM public.user_agents WHERE user_id = (select auth.uid())
      )
    )
  );

CREATE POLICY "delete_fase_requisitos"
  ON public.fase_requisitos
  FOR DELETE TO authenticated
  USING (
    (escopo = 'tenant' AND tenant_id = (select auth.uid()))
    OR (
      escopo = 'agente'
      AND agent_id IN (
        SELECT id FROM public.user_agents WHERE user_id = (select auth.uid())
      )
    )
  );
;

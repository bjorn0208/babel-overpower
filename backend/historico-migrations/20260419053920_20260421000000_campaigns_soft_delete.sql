
-- =========================================================================
-- Migration: 20260421000000_campaigns_soft_delete
-- Tarefa 1, Fase 1, Passo 2 (Módulo Campanha — ALTERAÇOES.md item #4)
-- =========================================================================
-- O que faz:
--   1. Adiciona `campaigns.deleted_at` (soft delete).
--   2. Recria índice parcial tenant+status filtrando `deleted_at IS NULL`.
--   3. Estende CHECK de `campaign_leads.exit_reason` para aceitar
--      `campanha_deletada` (correção #1 do sintese — enum real sem 'cancelado').
--   4. Cria RPC `soft_delete_campaign(p_campaign_id uuid)`:
--      - SECURITY DEFINER + SET search_path = '' (invioável).
--      - Ownership por tenant_id = (select auth.uid()) OR time (parent_user_id)
--        OR platform admin — alinhado com policies existentes em campaigns.
--      - UPDATE campaigns (deleted_at, status='paused', updated_at=now()).
--      - UPDATE campaign_leads ativos → state='desistente',
--        exit_reason='campanha_deletada', closed_at=now().
--      - UPDATE scheduled_actions pendentes action_type IN
--        ('campaign_trigger','campaign_reproposta') → cancelled.
--        (correção #5 — incluir campaign_reproposta).
--        Aqui usa `payload->>'campaign_id'`; na migration 3 vira
--        CREATE OR REPLACE usando coluna denormalizada.
-- Idempotência: IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE.
-- =========================================================================

-- 1. Coluna soft delete em campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- 2. Índice parcial tenant+status com filtro de deleted
DROP INDEX IF EXISTS public.idx_campaigns_tenant_not_deleted;
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_not_deleted
  ON public.campaigns (tenant_id, status)
  WHERE deleted_at IS NULL;

-- 3. Estender CHECK de exit_reason para aceitar campanha_deletada
ALTER TABLE public.campaign_leads
  DROP CONSTRAINT IF EXISTS campaign_leads_exit_reason_check;

ALTER TABLE public.campaign_leads
  ADD CONSTRAINT campaign_leads_exit_reason_check
  CHECK (
    exit_reason IS NULL OR exit_reason = ANY (ARRAY[
      'silencio'::text,
      'frase_negativa'::text,
      'recusa'::text,
      'opt_out'::text,
      'manual'::text,
      'convertido'::text,
      'campanha_deletada'::text
    ])
  );

-- 4. RPC soft_delete_campaign
CREATE OR REPLACE FUNCTION public.soft_delete_campaign(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_is_admin boolean;
  v_is_team_member boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Ownership check alinhado com policy campaigns_update_own
  SELECT tenant_id
    INTO v_tenant
    FROM public.campaigns
   WHERE id = p_campaign_id
     AND deleted_at IS NULL;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Platform admin bypass
  v_is_admin := public.is_platform_admin();

  -- Time: caller é team member cujo parent_user_id é o tenant da campanha
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_caller
       AND p.parent_user_id = v_tenant
  ) INTO v_is_team_member;

  IF NOT (v_tenant = v_caller OR v_is_admin OR v_is_team_member) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 1) Marca campanha como soft-deleted e pausa
  UPDATE public.campaigns
     SET deleted_at = now(),
         status     = 'paused',
         updated_at = now()
   WHERE id = p_campaign_id;

  -- 2) Fecha leads ativos (correção #1 — state='desistente', exit_reason novo)
  UPDATE public.campaign_leads
     SET state       = 'desistente',
         exit_reason = 'campanha_deletada',
         closed_at   = now()
   WHERE campaign_id = p_campaign_id
     AND state = 'ativo';

  -- 3) Cancela ações agendadas pendentes (correção #5 — inclui campaign_reproposta)
  --    Nesta versão usa payload->>; migration 3 (denormalização) substitui
  --    por scheduled_actions.campaign_id via CREATE OR REPLACE.
  UPDATE public.scheduled_actions
     SET status = 'cancelled'
   WHERE action_type IN ('campaign_trigger', 'campaign_reproposta')
     AND status = 'pending'
     AND (payload->>'campaign_id')::uuid = p_campaign_id;
END;
$$;

COMMENT ON FUNCTION public.soft_delete_campaign(uuid)
  IS 'Soft delete de campanha com cascata em campaign_leads e scheduled_actions. Ownership por tenant/team/admin.';

;

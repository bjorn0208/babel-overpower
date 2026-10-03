
-- =========================================================================
-- Migration: 20260421000200_contato_setores_e_repropostas
-- Tarefa 1, Fase 1, Passo 4 (Módulo Campanha — ALTERAÇOES.md item #5)
-- =========================================================================
-- Ordem interna (IMPORTANTE):
--   1. ADD COLUMN archived_at + reproposta_count em campaign_leads
--   2. CREATE TABLE campaign_lead_repropostas + RLS ENABLE + policy
--   3. 4 índices parciais em campaign_leads + 2 auxiliares em leads
--   4. RPC enviar_reproposta (tenant_opt_outs + reproposta_count<10 — LGPD)
--   5. RPC arquivar_desistentes
--   6. RPC converter_em_cliente (correção #2 — search_path '')
--   7. RPC get_campaign_metrics (usa scheduled_actions.campaign_id)
--   8. CREATE OR REPLACE soft_delete_campaign — usa campaign_id direto
--   9. Backfill archived_at nas campanhas finished/deleted
--  10. Função trigger + trigger archive_leads_on_campaign_end (APÓS backfill)
-- =========================================================================

-- ========== 1. COLUNAS NOVAS EM campaign_leads ==========
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reproposta_count integer NOT NULL DEFAULT 0;

-- ========== 2. TABELA campaign_lead_repropostas + RLS ==========
CREATE TABLE IF NOT EXISTS public.campaign_lead_repropostas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id uuid NOT NULL REFERENCES public.campaign_leads(id) ON DELETE CASCADE,
  texto            text NOT NULL,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_lead_repropostas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_repropostas" ON public.campaign_lead_repropostas;
CREATE POLICY "tenant_select_repropostas"
  ON public.campaign_lead_repropostas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.campaign_leads cl
        JOIN public.campaigns c ON c.id = cl.campaign_id
       WHERE cl.id = campaign_lead_id
         AND (
              c.tenant_id = (select auth.uid())
           OR c.tenant_id IN (
                SELECT p.parent_user_id FROM public.profiles p
                 WHERE p.id = (select auth.uid())
                   AND p.parent_user_id IS NOT NULL
              )
           OR public.is_platform_admin()
         )
    )
  );

-- ========== 3. ÍNDICES ==========
-- FK index pra campaign_lead_repropostas
CREATE INDEX IF NOT EXISTS idx_campaign_lead_repropostas_cl_id
  ON public.campaign_lead_repropostas (campaign_lead_id, sent_at DESC);

-- FK index pra created_by (evita FK unindexed advisor)
CREATE INDEX IF NOT EXISTS idx_campaign_lead_repropostas_created_by
  ON public.campaign_lead_repropostas (created_by)
  WHERE created_by IS NOT NULL;

-- Parciais em campaign_leads (seção 6.2 do supabase.md)
CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead_state_ativos
  ON public.campaign_leads (lead_id, state) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_campanha_fase_ativos
  ON public.campaign_leads (campaign_id, phase, state) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_desistentes
  ON public.campaign_leads (campaign_id)
  WHERE state = 'desistente' AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_fechados
  ON public.campaign_leads (campaign_id)
  WHERE state = 'fechado' AND archived_at IS NULL;

-- Parcial em leads pra Atendimento/dashboard
CREATE INDEX IF NOT EXISTS idx_leads_tenant_converted_null
  ON public.leads (tenant_id) WHERE converted_at IS NULL;

-- Parcial em campaigns pra scheduler
CREATE INDEX IF NOT EXISTS idx_campaigns_ativas
  ON public.campaigns (id) WHERE status = 'active' AND deleted_at IS NULL;

-- ========== 4. RPC enviar_reproposta ==========
-- Contrato: array de campaign_lead_ids + texto personalizado opcional.
-- Gates: tenant_opt_outs (LGPD) + reproposta_count<10 + ownership.
-- Enfileira em scheduled_actions(campaign_reproposta) — worker dispatcha.
CREATE OR REPLACE FUNCTION public.enviar_reproposta(
  p_campaign_lead_ids uuid[],
  p_texto             text DEFAULT NULL
)
RETURNS TABLE (
  campaign_lead_id  uuid,
  reproposta_id     uuid,
  scheduled_action_id uuid,
  status            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rec    record;
  v_repid  uuid;
  v_actid  uuid;
  v_conv   uuid;
  v_agent  uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  FOR v_rec IN
    SELECT
      cl.id               AS cl_id,
      cl.lead_id          AS lead_id,
      cl.campaign_id      AS campaign_id,
      cl.reproposta_count AS rep_count,
      c.tenant_id         AS tenant_id,
      c.status            AS campaign_status,
      c.deleted_at        AS campaign_deleted_at
    FROM public.campaign_leads cl
    JOIN public.campaigns c ON c.id = cl.campaign_id
    WHERE cl.id = ANY(p_campaign_lead_ids)
      AND (
            c.tenant_id = v_caller
         OR c.tenant_id IN (
              SELECT p.parent_user_id FROM public.profiles p
               WHERE p.id = v_caller AND p.parent_user_id IS NOT NULL
            )
         OR public.is_platform_admin()
      )
  LOOP
    -- Gate 1: campanha ativa e não deletada
    IF v_rec.campaign_deleted_at IS NOT NULL
       OR v_rec.campaign_status NOT IN ('active','paused') THEN
      campaign_lead_id := v_rec.cl_id;
      reproposta_id := NULL;
      scheduled_action_id := NULL;
      status := 'campanha_inativa';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Gate 2: throttle anti-spam (reproposta_count < 10)
    IF v_rec.rep_count >= 10 THEN
      campaign_lead_id := v_rec.cl_id;
      reproposta_id := NULL;
      scheduled_action_id := NULL;
      status := 'throttle_atingido';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Gate 3 (INVIOLÁVEL LGPD): lead com opt-out não recebe reproposta
    IF EXISTS (
      SELECT 1 FROM public.tenant_opt_outs toov
       WHERE toov.tenant_id = v_rec.tenant_id
         AND toov.lead_id   = v_rec.lead_id
    ) THEN
      campaign_lead_id := v_rec.cl_id;
      reproposta_id := NULL;
      scheduled_action_id := NULL;
      status := 'opt_out';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Gate 4: lead opt_out_at (LGPD no lead direto)
    IF EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id = v_rec.lead_id
         AND l.opt_out_at IS NOT NULL
    ) THEN
      campaign_lead_id := v_rec.cl_id;
      reproposta_id := NULL;
      scheduled_action_id := NULL;
      status := 'opt_out_lead';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Registra reproposta
    INSERT INTO public.campaign_lead_repropostas (
      campaign_lead_id, texto, created_by
    ) VALUES (
      v_rec.cl_id,
      COALESCE(p_texto, ''),
      v_caller
    ) RETURNING id INTO v_repid;

    -- Busca conversation/agent do lead pra popular scheduled_actions
    SELECT co.id, co.agent_id
      INTO v_conv, v_agent
      FROM public.conversations co
     WHERE co.lead_id = v_rec.lead_id
       AND co.tenant_id = v_rec.tenant_id
     ORDER BY co.updated_at DESC NULLS LAST
     LIMIT 1;

    -- Enfileira ação (campaign_id preenchido pela trigger BEFORE INSERT)
    INSERT INTO public.scheduled_actions (
      lead_id, conversation_id, agent_id, action_type,
      scheduled_at, status, payload
    ) VALUES (
      v_rec.lead_id,
      v_conv,
      v_agent,
      'campaign_reproposta',
      now(),
      'pending',
      jsonb_build_object(
        'campaign_id',      v_rec.campaign_id,
        'campaign_lead_id', v_rec.cl_id,
        'reproposta_id',    v_repid,
        'texto_personalizado', COALESCE(p_texto, '')
      )
    ) RETURNING id INTO v_actid;

    -- Incrementa throttle
    UPDATE public.campaign_leads
       SET reproposta_count = reproposta_count + 1
     WHERE id = v_rec.cl_id;

    campaign_lead_id := v_rec.cl_id;
    reproposta_id := v_repid;
    scheduled_action_id := v_actid;
    status := 'enfileirada';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.enviar_reproposta(uuid[], text)
  IS 'Enfileira reproposta para campaign_leads. Respeita tenant_opt_outs (LGPD), opt_out_at no lead, reproposta_count<10 e campanha ativa.';

-- ========== 5. RPC arquivar_desistentes ==========
CREATE OR REPLACE FUNCTION public.arquivar_desistentes(
  p_campaign_lead_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count  integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  WITH allowed AS (
    SELECT cl.id
      FROM public.campaign_leads cl
      JOIN public.campaigns c ON c.id = cl.campaign_id
     WHERE cl.id = ANY(p_campaign_lead_ids)
       AND (
             c.tenant_id = v_caller
          OR c.tenant_id IN (
               SELECT p.parent_user_id FROM public.profiles p
                WHERE p.id = v_caller AND p.parent_user_id IS NOT NULL
             )
          OR public.is_platform_admin()
       )
       AND cl.state = 'desistente'
       AND cl.archived_at IS NULL
  )
  UPDATE public.campaign_leads cl
     SET archived_at = now()
    FROM allowed a
   WHERE cl.id = a.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.arquivar_desistentes(uuid[])
  IS 'Arquiva (archived_at=now) campaign_leads desistentes selecionados. Ownership tenant/team/admin.';

-- ========== 6. RPC converter_em_cliente ==========
CREATE OR REPLACE FUNCTION public.converter_em_cliente(
  p_campaign_lead_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_lead   uuid;
  v_tenant uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT cl.lead_id, c.tenant_id
    INTO v_lead, v_tenant
    FROM public.campaign_leads cl
    JOIN public.campaigns c ON c.id = cl.campaign_id
   WHERE cl.id = p_campaign_lead_id;

  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT (
       v_tenant = v_caller
    OR EXISTS (
         SELECT 1 FROM public.profiles p
          WHERE p.id = v_caller AND p.parent_user_id = v_tenant
       )
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Marca lead convertido
  UPDATE public.leads
     SET converted_at = COALESCE(converted_at, now()),
         updated_at   = now()
   WHERE id = v_lead;

  -- Fecha + arquiva campaign_lead
  UPDATE public.campaign_leads
     SET state        = 'fechado',
         exit_reason  = 'convertido',
         closed_at    = COALESCE(closed_at, now()),
         archived_at  = COALESCE(archived_at, now())
   WHERE id = p_campaign_lead_id;
END;
$$;

COMMENT ON FUNCTION public.converter_em_cliente(uuid)
  IS 'Marca lead como convertido (leads.converted_at) e fecha+arquiva campaign_lead.';

-- ========== 7. RPC get_campaign_metrics ==========
CREATE OR REPLACE FUNCTION public.get_campaign_metrics(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_ativos        integer;
  v_fechados      integer;
  v_desistentes   integer;
  v_repropostas   integer;
  v_proximos      jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT tenant_id
    INTO v_tenant
    FROM public.campaigns
   WHERE id = p_campaign_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT (
       v_tenant = v_caller
    OR EXISTS (
         SELECT 1 FROM public.profiles p
          WHERE p.id = v_caller AND p.parent_user_id = v_tenant
       )
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE state = 'ativo' AND archived_at IS NULL),
    COUNT(*) FILTER (WHERE state = 'fechado' AND archived_at IS NULL),
    COUNT(*) FILTER (WHERE state = 'desistente' AND archived_at IS NULL)
  INTO v_ativos, v_fechados, v_desistentes
  FROM public.campaign_leads
  WHERE campaign_id = p_campaign_id;

  SELECT COUNT(*)
    INTO v_repropostas
    FROM public.campaign_lead_repropostas clr
    JOIN public.campaign_leads cl ON cl.id = clr.campaign_lead_id
   WHERE cl.campaign_id = p_campaign_id;

  -- Próximas 10 ações pendentes (usa coluna denormalizada — Passo 3)
  SELECT COALESCE(jsonb_agg(rows ORDER BY rows->>'scheduled_at' ASC), '[]'::jsonb)
    INTO v_proximos
    FROM (
      SELECT jsonb_build_object(
        'id',           sa.id,
        'lead_id',      sa.lead_id,
        'action_type',  sa.action_type,
        'scheduled_at', sa.scheduled_at
      ) AS rows
      FROM public.scheduled_actions sa
      WHERE sa.campaign_id = p_campaign_id
        AND sa.status = 'pending'
        AND sa.action_type LIKE 'campaign%'
      ORDER BY sa.scheduled_at ASC
      LIMIT 10
    ) t;

  RETURN jsonb_build_object(
    'ativos',      v_ativos,
    'fechados',    v_fechados,
    'desistentes', v_desistentes,
    'repropostas', v_repropostas,
    'proximos_10', v_proximos
  );
END;
$$;

COMMENT ON FUNCTION public.get_campaign_metrics(uuid)
  IS 'Métricas da aba Métricas da campanha. Lê scheduled_actions.campaign_id (denormalizada).';

-- ========== 8. CREATE OR REPLACE soft_delete_campaign ==========
-- Substitui payload->>'campaign_id' pela coluna denormalizada
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

  SELECT tenant_id
    INTO v_tenant
    FROM public.campaigns
   WHERE id = p_campaign_id
     AND deleted_at IS NULL;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  v_is_admin := public.is_platform_admin();

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_caller
       AND p.parent_user_id = v_tenant
  ) INTO v_is_team_member;

  IF NOT (v_tenant = v_caller OR v_is_admin OR v_is_team_member) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.campaigns
     SET deleted_at = now(),
         status     = 'paused',
         updated_at = now()
   WHERE id = p_campaign_id;

  UPDATE public.campaign_leads
     SET state       = 'desistente',
         exit_reason = 'campanha_deletada',
         closed_at   = now()
   WHERE campaign_id = p_campaign_id
     AND state = 'ativo';

  -- Agora usa coluna denormalizada (Passo 3) — elimina payload->> seq scan
  UPDATE public.scheduled_actions
     SET status = 'cancelled'
   WHERE action_type IN ('campaign_trigger', 'campaign_reproposta')
     AND status = 'pending'
     AND campaign_id = p_campaign_id;
END;
$$;

-- ========== 9. BACKFILL archived_at ==========
-- Arquiva leads em campanhas já finished ou soft-deleted (backfill inicial).
UPDATE public.campaign_leads cl
   SET archived_at = COALESCE(cl.closed_at, now())
  FROM public.campaigns c
 WHERE c.id = cl.campaign_id
   AND cl.archived_at IS NULL
   AND (c.status = 'finished' OR c.deleted_at IS NOT NULL);

-- ========== 10. TRIGGER archive_leads_on_campaign_end ==========
-- DEPOIS do backfill pra evitar cascata em massa na criação.
CREATE OR REPLACE FUNCTION public.fn_archive_leads_on_campaign_end()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'finished')
    OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  ) THEN
    UPDATE public.campaign_leads
       SET archived_at = COALESCE(archived_at, now())
     WHERE campaign_id = NEW.id
       AND archived_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_archive_leads_on_campaign_end()
  IS 'Arquiva campaign_leads quando campanha vai pra finished ou é soft-deleted.';

DROP TRIGGER IF EXISTS trg_archive_leads_on_campaign_end ON public.campaigns;
CREATE TRIGGER trg_archive_leads_on_campaign_end
  AFTER UPDATE OF status, deleted_at ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_archive_leads_on_campaign_end();

;

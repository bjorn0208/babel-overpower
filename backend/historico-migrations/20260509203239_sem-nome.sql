
-- ============================================================
-- FIX 1: leads.anon_read_tracking — vazamento de PII de 4880 leads
-- ============================================================

-- Remove a policy que libera SELECT anônimo em todas as linhas
DROP POLICY IF EXISTS anon_read_tracking ON public.leads;

-- RPC segura: dado uma chave de rastreamento, devolve só campos não-sensíveis
CREATE OR REPLACE FUNCTION public.get_lead_tracking_status(_chave uuid)
RETURNS TABLE (
  id uuid,
  fase_pipeline text,
  fase_cliente text,
  temperatura_lead text,
  pontuacao integer,
  is_hot boolean,
  precisa_humano boolean,
  client_checkpoints jsonb,
  tarefas_cliente jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.fase_pipeline,
    l.fase_cliente,
    l.temperatura_lead,
    l.pontuacao,
    l.is_hot,
    l.precisa_humano,
    l.client_checkpoints,
    l.tarefas_cliente,
    l.created_at,
    l.updated_at
  FROM public.leads l
  WHERE l.chave_rastreamento = _chave
    AND l.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_lead_tracking_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lead_tracking_status(uuid) TO anon, authenticated;

-- ============================================================
-- FIX 2: agendamentos_config — qualquer authenticated pode escrever
-- ============================================================

DROP POLICY IF EXISTS cronjobs_config_insert_admin ON public.agendamentos_config;
DROP POLICY IF EXISTS cronjobs_config_update_admin ON public.agendamentos_config;
DROP POLICY IF EXISTS cronjobs_config_delete_admin ON public.agendamentos_config;

CREATE POLICY cronjobs_config_insert_admin
  ON public.agendamentos_config
  FOR INSERT TO authenticated
  WITH CHECK (public.eh_admin_plataforma());

CREATE POLICY cronjobs_config_update_admin
  ON public.agendamentos_config
  FOR UPDATE TO authenticated
  USING (public.eh_admin_plataforma())
  WITH CHECK (public.eh_admin_plataforma());

CREATE POLICY cronjobs_config_delete_admin
  ON public.agendamentos_config
  FOR DELETE TO authenticated
  USING (public.eh_admin_plataforma());

;

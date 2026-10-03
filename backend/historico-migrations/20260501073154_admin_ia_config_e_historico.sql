-- ============================================================================
-- admin_ia_config — singleton com identidade do agente + prompt XML customizado
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_ia_config (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_agente        text NOT NULL DEFAULT 'Admin IA',
  avatar_url         text,
  system_prompt_xml  text,
  modelo_default     text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por     uuid
);

-- garantir singleton (1 linha sempre)
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_ia_config_singleton ON public.admin_ia_config ((true));

INSERT INTO public.admin_ia_config (id, nome_agente, modelo_default)
VALUES ('00000000-0000-0000-0000-000000000001', 'Admin IA', 'google/gemini-2.5-flash')
ON CONFLICT DO NOTHING;

ALTER TABLE public.admin_ia_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_ia_config_admin_select" ON public.admin_ia_config
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

CREATE POLICY "admin_ia_config_admin_update" ON public.admin_ia_config
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

COMMENT ON TABLE public.admin_ia_config IS 'Singleton (1 row) — identidade visual + system prompt override do Admin IA. Edge admin-ia lê e usa custom_prompt em vez de hardcoded quando setado.';

-- ============================================================================
-- admin_ia_conversations — histórico de conversas do Admin IA
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_ia_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  titulo        text NOT NULL DEFAULT 'Nova conversa',
  primeira_msg  text,
  total_turnos  integer NOT NULL DEFAULT 0,
  custo_total   numeric(10,6) NOT NULL DEFAULT 0,
  modelo_usado  text,
  ultimo_em     timestamptz NOT NULL DEFAULT now(),
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_ia_conv_actor ON public.admin_ia_conversations (actor_user_id, ultimo_em DESC);

ALTER TABLE public.admin_ia_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_ia_conv_admin_select" ON public.admin_ia_conversations
  FOR SELECT TO authenticated
  USING (
    actor_user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin')
  );

CREATE POLICY "admin_ia_conv_admin_insert" ON public.admin_ia_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin')
  );

CREATE POLICY "admin_ia_conv_service_role_update" ON public.admin_ia_conversations
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.admin_ia_conversations IS 'Histórico de conversas com o Admin IA. Cada conversa é referenciada em admin_ia_actions.conversation_id.';

-- ============================================================================
-- RPC admin_ia_custo_mes_corrente — agrega gasto do mês
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_ia_custo_mes_corrente()
RETURNS TABLE (
  custo_total numeric,
  custo_llm numeric,
  custo_embed numeric,
  custo_rerank numeric,
  total_chamadas bigint,
  inicio_mes timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inicio timestamptz := date_trunc('month', now());
BEGIN
  RETURN QUERY
  SELECT
    coalesce(sum(custo_total), 0)::numeric AS custo_total,
    coalesce(sum(custo_total) FILTER (WHERE tipo = 'admin_ia_chat'), 0)::numeric AS custo_llm,
    coalesce(sum(custo_total) FILTER (WHERE tipo IN ('embed_chunk','embed_query') AND metadata->>'origem' = 'admin_ia'), 0)::numeric AS custo_embed,
    coalesce(sum(custo_total) FILTER (WHERE tipo = 'admin_ia_rerank'), 0)::numeric AS custo_rerank,
    count(*) FILTER (WHERE tipo LIKE 'admin_ia%' OR (tipo IN ('embed_chunk','embed_query') AND metadata->>'origem' = 'admin_ia'))::bigint AS total_chamadas,
    v_inicio AS inicio_mes
  FROM public.llm_request_logs
  WHERE created_at >= v_inicio;
END;
$$;

COMMENT ON FUNCTION public.admin_ia_custo_mes_corrente IS 'Custo total do Admin IA no mês corrente (LLM + embed + rerank). Reseta automático todo dia 1.';
;

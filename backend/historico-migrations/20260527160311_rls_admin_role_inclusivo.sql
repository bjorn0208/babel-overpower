-- Ajuste RLS Onda 5: aceitar tanto 'admin' (role atual do theus@admin.com) quanto 'platform_admin'
-- nas 4 tabelas criadas nas Ondas 3-4 + na função destilar_perfil_empresa.

-- Helper inline: predicado reutilizável
-- (Postgres não tem "function in policy" elegante sem SECURITY DEFINER, então duplicamos o EXISTS)

DROP POLICY IF EXISTS config_chamadas_admin_all ON public.config_chamadas_llm;
CREATE POLICY config_chamadas_admin_all ON public.config_chamadas_llm
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  );

DROP POLICY IF EXISTS historico_config_chamadas_admin_select ON public.historico_config_chamadas_llm;
CREATE POLICY historico_config_chamadas_admin_select ON public.historico_config_chamadas_llm
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  );

DROP POLICY IF EXISTS perfil_empresa_proprio ON public.perfil_empresa;
CREATE POLICY perfil_empresa_proprio ON public.perfil_empresa
  FOR SELECT TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  );

DROP POLICY IF EXISTS perfil_empresa_admin_write ON public.perfil_empresa;
CREATE POLICY perfil_empresa_admin_write ON public.perfil_empresa
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  );

DROP POLICY IF EXISTS comparativo_nicho_proprio ON public.comparativo_nicho;
CREATE POLICY comparativo_nicho_proprio ON public.comparativo_nicho
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.nicho_id = comparativo_nicho.nicho_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  );

DROP POLICY IF EXISTS comparativo_nicho_admin_write ON public.comparativo_nicho;
CREATE POLICY comparativo_nicho_admin_write ON public.comparativo_nicho
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  );

DROP POLICY IF EXISTS mapa_emocao_afeto_admin_write ON public.mapa_emocao_afeto;
CREATE POLICY mapa_emocao_afeto_admin_write ON public.mapa_emocao_afeto
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('admin','platform_admin')
    )
  );

-- Ajusta destilar_perfil_empresa pra aceitar role 'admin' também
CREATE OR REPLACE FUNCTION public.destilar_perfil_empresa(p_tenant_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_destilados int := 0;
  v_eh_admin boolean;
  v_uid uuid;
BEGIN
  v_uid := (select auth.uid());

  IF v_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_uid AND role IN ('admin','platform_admin')
    ) INTO v_eh_admin;

    IF NOT v_eh_admin THEN
      RAISE EXCEPTION 'apenas admin/platform_admin pode destilar perfil_empresa';
    END IF;
  END IF;

  WITH tenants_alvo AS (
    SELECT DISTINCT l.tenant_id AS tid
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
  ),
  metricas AS (
    SELECT
      t.tid,
      count(*) FILTER (WHERE l.desfecho = 'convertido') AS convertidos,
      count(*) FILTER (WHERE l.desfecho IN ('convertido','sumido','recusado','desqualificado')) AS fechados,
      count(*) AS total_leads,
      (SELECT n.nome_exibicao FROM public.profiles p
        JOIN public.nichos n ON n.id = p.nicho_id
        WHERE p.id = t.tid LIMIT 1) AS segmento
    FROM tenants_alvo t
    LEFT JOIN public.leads l ON l.tenant_id = t.tid AND l.deleted_at IS NULL
    GROUP BY t.tid
  ),
  upserts AS (
    INSERT INTO public.perfil_empresa AS pe (
      tenant_id, segmento, taxa_conversao_estimada, conversas_destiladas,
      destilacao_ultima_em
    )
    SELECT
      tid,
      segmento,
      CASE WHEN fechados > 0 THEN round(convertidos::numeric / fechados, 4) ELSE NULL END,
      total_leads,
      now()
    FROM metricas
    WHERE tid IS NOT NULL
    ON CONFLICT (tenant_id) DO UPDATE SET
      segmento = excluded.segmento,
      taxa_conversao_estimada = excluded.taxa_conversao_estimada,
      conversas_destiladas = excluded.conversas_destiladas,
      destilacao_ultima_em = now(),
      versao = pe.versao + 1,
      atualizado_em = now()
    RETURNING pe.tenant_id
  )
  SELECT count(*)::int INTO v_destilados FROM upserts;

  RETURN v_destilados;
END;
$$;
;

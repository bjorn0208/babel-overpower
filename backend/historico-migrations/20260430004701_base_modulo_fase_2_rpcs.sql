-- Fase 2 do Módulo Base — RPCs de transição, refinamento e leitura
-- Todas SECURITY DEFINER + SET search_path = '' + valida tenant via auth.uid()

CREATE OR REPLACE FUNCTION public._lead_pertence_caller(p_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_admin boolean;
  v_team boolean;
BEGIN
  IF v_caller IS NULL THEN RETURN false; END IF;
  SELECT tenant_id INTO v_tenant FROM public.leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN RETURN false; END IF;
  v_admin := public.is_platform_admin();
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND parent_user_id = v_tenant
  ) INTO v_team;
  RETURN (v_tenant = v_caller OR v_admin OR v_team);
END;
$$;

CREATE OR REPLACE FUNCTION public.enviar_para_base(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads
     SET location = 'base', updated_at = now()
   WHERE id = p_lead_id AND deleted_at IS NULL;

  UPDATE public.conversations
     SET status = 'closed', agent_enabled = false, updated_at = now()
   WHERE lead_id = p_lead_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tornar_cliente_via_base(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads
     SET location = 'cliente',
         converted_at = COALESCE(converted_at, now()),
         client_stage = COALESCE(client_stage, 'documentacao'),
         pipeline_stage = 'fechado',
         updated_at = now()
   WHERE id = p_lead_id AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.concluir_servico(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads
     SET location = 'base',
         client_stage = 'concluido',
         updated_at = now()
   WHERE id = p_lead_id AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.importar_contatos_para_base(p_tenant_id uuid, p_contatos jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_admin boolean := public.is_platform_admin();
  v_team boolean;
  v_count integer := 0;
  v_item jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND parent_user_id = p_tenant_id
  ) INTO v_team;
  IF NOT (p_tenant_id = v_caller OR v_admin OR v_team) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_contatos)
  LOOP
    INSERT INTO public.leads (tenant_id, name, display_name, phone, email, tags, location)
    VALUES (
      p_tenant_id,
      COALESCE(v_item->>'name', v_item->>'phone'),
      v_item->>'name',
      v_item->>'phone',
      v_item->>'email',
      CASE
        WHEN jsonb_typeof(v_item->'tags') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'tags'))
        ELSE NULL
      END,
      'base'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_custom_field(p_lead_id uuid, p_chave text, p_valor text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_chave IS NULL OR length(trim(p_chave)) = 0 THEN
    RAISE EXCEPTION 'chave_invalida';
  END IF;

  UPDATE public.leads
     SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object(p_chave, p_valor),
         updated_at = now()
   WHERE id = p_lead_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_custom_field(p_lead_id uuid, p_chave text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads
     SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) - p_chave,
         updated_at = now()
   WHERE id = p_lead_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.metricas_base(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_admin boolean := public.is_platform_admin();
  v_team boolean;
  v_total integer;
  v_leads integer;
  v_clientes integer;
  v_top_produto text;
  v_distribuicao_tags jsonb;
  v_distribuicao_meses jsonb;
  v_total_consumido numeric;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND parent_user_id = p_tenant_id
  ) INTO v_team;
  IF NOT (p_tenant_id = v_caller OR v_admin OR v_team) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE converted_at IS NULL),
         COUNT(*) FILTER (WHERE converted_at IS NOT NULL)
    INTO v_total, v_leads, v_clientes
    FROM public.leads
   WHERE tenant_id = p_tenant_id
     AND location = 'base'
     AND deleted_at IS NULL;

  SELECT product INTO v_top_produto
    FROM public.leads
   WHERE tenant_id = p_tenant_id
     AND location = 'base'
     AND deleted_at IS NULL
     AND product IS NOT NULL
   GROUP BY product
   ORDER BY COUNT(*) DESC
   LIMIT 1;

  SELECT COALESCE(jsonb_object_agg(tag, qtd), '{}'::jsonb)
    INTO v_distribuicao_tags
  FROM (
    SELECT unnest(tags) AS tag, COUNT(*) AS qtd
      FROM public.leads
     WHERE tenant_id = p_tenant_id
       AND location = 'base'
       AND deleted_at IS NULL
       AND tags IS NOT NULL
     GROUP BY tag
     ORDER BY qtd DESC
     LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_object_agg(mes, qtd), '{}'::jsonb)
    INTO v_distribuicao_meses
  FROM (
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mes,
           COUNT(*) AS qtd
      FROM public.leads
     WHERE tenant_id = p_tenant_id
       AND location = 'base'
       AND deleted_at IS NULL
     GROUP BY mes
     ORDER BY mes DESC
     LIMIT 12
  ) m;

  SELECT COALESCE(SUM(cp.valor), 0)
    INTO v_total_consumido
    FROM public.client_payments cp
    JOIN public.leads l ON l.id = cp.lead_id
   WHERE l.tenant_id = p_tenant_id
     AND l.location = 'base'
     AND l.converted_at IS NOT NULL
     AND l.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'total', v_total,
    'leads', v_leads,
    'clientes', v_clientes,
    'produto_mais_vendido', v_top_produto,
    'distribuicao_tags', v_distribuicao_tags,
    'distribuicao_temporal_meses', v_distribuicao_meses,
    'total_consumido_clientes', v_total_consumido
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tags_disponiveis_base(p_tenant_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_admin boolean := public.is_platform_admin();
  v_team boolean;
  v_tags text[];
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND parent_user_id = p_tenant_id
  ) INTO v_team;
  IF NOT (p_tenant_id = v_caller OR v_admin OR v_team) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT tag ORDER BY tag), ARRAY[]::text[])
    INTO v_tags
  FROM (
    SELECT unnest(tags) AS tag
      FROM public.leads
     WHERE tenant_id = p_tenant_id
       AND deleted_at IS NULL
       AND tags IS NOT NULL
  ) t;
  RETURN v_tags;
END;
$$;

CREATE OR REPLACE FUNCTION public.resumo_cliente(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_contratos jsonb;
  v_total_consumido numeric;
  v_total_pago numeric;
  v_total_pendente numeric;
  v_proxima_parcela jsonb;
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(c ORDER BY signed_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_contratos
  FROM (
    SELECT id, title, status, signed_at,
           COALESCE((payment_options->>'valor_a_vista')::numeric, 0) AS valor
      FROM public.contracts
     WHERE lead_id = p_lead_id
       AND signed_at IS NOT NULL
  ) c;

  SELECT COALESCE(SUM(valor), 0)
    INTO v_total_consumido
    FROM public.client_payments
   WHERE lead_id = p_lead_id;

  SELECT COALESCE(SUM(valor) FILTER (WHERE status = 'pago'), 0),
         COALESCE(SUM(valor) FILTER (WHERE status = 'pendente'), 0)
    INTO v_total_pago, v_total_pendente
    FROM public.client_payments
   WHERE lead_id = p_lead_id;

  SELECT to_jsonb(p)
    INTO v_proxima_parcela
  FROM (
    SELECT id, descricao, valor, data_vencimento
      FROM public.client_payments
     WHERE lead_id = p_lead_id
       AND status = 'pendente'
     ORDER BY data_vencimento NULLS LAST
     LIMIT 1
  ) p;

  RETURN jsonb_build_object(
    'contratos', v_contratos,
    'total_consumido', v_total_consumido,
    'total_pago', v_total_pago,
    'total_pendente', v_total_pendente,
    'proxima_parcela', v_proxima_parcela
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.contar_publico_campanha(p_tenant_id uuid, p_type text, p_filters jsonb, p_inatividade_ms bigint)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'auth'
AS $$
DECLARE
  v_count integer;
  v_corte timestamptz;
BEGIN
  v_corte := now() - make_interval(secs => (p_inatividade_ms::numeric / 1000)::double precision);

  IF p_type = 'cobranca' THEN
    SELECT COUNT(DISTINCT l.id) INTO v_count
    FROM public.leads l
    JOIN public.client_payments cp ON cp.lead_id = l.id AND cp.status = 'pendente' AND cp.data_vencimento < CURRENT_DATE
    LEFT JOIN public.campaign_leads cl ON cl.lead_id = l.id AND cl.state = 'ativo'
    LEFT JOIN public.tenant_opt_outs o ON o.lead_id = l.id AND o.tenant_id = p_tenant_id
    WHERE l.tenant_id = p_tenant_id
      AND l.location = 'base'
      AND l.deleted_at IS NULL
      AND cl.id IS NULL
      AND o.id IS NULL;
    RETURN v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.leads l
  LEFT JOIN public.campaign_leads cl ON cl.lead_id = l.id AND cl.state = 'ativo'
  LEFT JOIN public.tenant_opt_outs o ON o.lead_id = l.id AND o.tenant_id = p_tenant_id
  WHERE l.tenant_id = p_tenant_id
    AND l.location = 'base'
    AND l.deleted_at IS NULL
    AND l.updated_at < v_corte
    AND cl.id IS NULL
    AND o.id IS NULL
    AND (
      p_filters->'tags' IS NULL
      OR jsonb_array_length(p_filters->'tags') = 0
      OR (
        (p_filters->>'operator' = 'OR' AND l.tags && ARRAY(SELECT jsonb_array_elements_text(p_filters->'tags')))
        OR (COALESCE(p_filters->>'operator', 'AND') = 'AND' AND l.tags @> ARRAY(SELECT jsonb_array_elements_text(p_filters->'tags')))
      )
    );
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_archive_leads_on_campaign_end()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
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

    UPDATE public.leads l
       SET location = CASE
                        WHEN l.converted_at IS NOT NULL THEN 'cliente'
                        ELSE 'base'
                      END,
           updated_at = now()
      FROM public.campaign_leads cl
     WHERE cl.campaign_id = NEW.id
       AND cl.lead_id = l.id
       AND l.deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

;

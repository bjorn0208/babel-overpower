-- Migration 03 · Fase 4 · Base v2
-- ALTER base_segmentos + critérios evaluator + RPCs descer_lead + recalcular_contagem

-- 1. Colunas novas em base_segmentos
ALTER TABLE public.base_segmentos
  ADD COLUMN IF NOT EXISTS descricao text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contagem_leads integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS atualizado_contagem_em timestamptz DEFAULT now();

-- 2. Evaluator de um critério contra as tags de um lead
CREATE OR REPLACE FUNCTION public.avaliar_criterio_segmento(
  p_tags text[],
  p_criterio jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chave    text;
  v_op       text;
  v_valores  text[];
  v_tag_val  text;
BEGIN
  v_chave := p_criterio->>'chave';
  v_op    := p_criterio->>'operador';

  SELECT substring(t FROM length(v_chave) + 2)
  INTO v_tag_val
  FROM unnest(p_tags) AS t
  WHERE t LIKE v_chave || ':%'
  LIMIT 1;

  CASE v_op
    WHEN 'eq' THEN
      RETURN (v_chave || ':' || (p_criterio->>'valor')) = ANY(p_tags);
    WHEN 'neq' THEN
      RETURN NOT ((v_chave || ':' || (p_criterio->>'valor')) = ANY(p_tags));
    WHEN 'in', 'contains_any' THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(p_criterio->'valores')) INTO v_valores;
      RETURN EXISTS (
        SELECT 1 FROM unnest(p_tags) AS t
        WHERE t LIKE v_chave || ':%'
          AND substring(t FROM length(v_chave) + 2) = ANY(v_valores)
      );
    WHEN 'not_in' THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(p_criterio->'valores')) INTO v_valores;
      RETURN NOT EXISTS (
        SELECT 1 FROM unnest(p_tags) AS t
        WHERE t LIKE v_chave || ':%'
          AND substring(t FROM length(v_chave) + 2) = ANY(v_valores)
      );
    WHEN 'contains_all' THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(p_criterio->'valores')) INTO v_valores;
      RETURN (
        SELECT COUNT(*) FROM unnest(v_valores) AS v
        WHERE (v_chave || ':' || v) = ANY(p_tags)
      ) = array_length(v_valores, 1);
    WHEN 'gte' THEN
      RETURN v_tag_val IS NOT NULL AND v_tag_val::numeric >= (p_criterio->>'valor')::numeric;
    WHEN 'gt' THEN
      RETURN v_tag_val IS NOT NULL AND v_tag_val::numeric > (p_criterio->>'valor')::numeric;
    WHEN 'lte' THEN
      RETURN v_tag_val IS NOT NULL AND v_tag_val::numeric <= (p_criterio->>'valor')::numeric;
    WHEN 'lt' THEN
      RETURN v_tag_val IS NOT NULL AND v_tag_val::numeric < (p_criterio->>'valor')::numeric;
    WHEN 'between' THEN
      RETURN v_tag_val IS NOT NULL
        AND v_tag_val::numeric >= (p_criterio->>'valor_min')::numeric
        AND v_tag_val::numeric <= (p_criterio->>'valor_max')::numeric;
    WHEN 'is_null' THEN
      RETURN NOT EXISTS (SELECT 1 FROM unnest(p_tags) AS t WHERE t LIKE v_chave || ':%');
    WHEN 'is_not_null' THEN
      RETURN EXISTS (SELECT 1 FROM unnest(p_tags) AS t WHERE t LIKE v_chave || ':%');
    ELSE
      RETURN true;
  END CASE;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$$;

-- 3. RPC: recalcular contagem de leads para um segmento
CREATE OR REPLACE FUNCTION public.recalcular_contagem_segmento(p_segmento_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_filtros   jsonb;
  v_criterios jsonb;
  v_op_global text;
  v_contagem  integer;
BEGIN
  SELECT tenant_id, filtros INTO v_tenant_id, v_filtros
  FROM public.base_segmentos WHERE id = p_segmento_id;

  IF v_tenant_id IS NULL THEN RETURN 0; END IF;

  v_criterios := COALESCE(v_filtros->'criterios', '[]'::jsonb);
  v_op_global := COALESCE(v_filtros->>'operador_global', 'AND');

  IF jsonb_array_length(v_criterios) = 0 THEN
    SELECT COUNT(*) INTO v_contagem
    FROM public.leads
    WHERE tenant_id = v_tenant_id AND location = 'base' AND deleted_at IS NULL;
  ELSE
    SELECT COUNT(*) INTO v_contagem
    FROM public.leads l
    WHERE l.tenant_id = v_tenant_id
      AND l.location = 'base'
      AND l.deleted_at IS NULL
      AND (
        CASE v_op_global
          WHEN 'OR' THEN
            EXISTS (
              SELECT 1 FROM jsonb_array_elements(v_criterios) AS c
              WHERE public.avaliar_criterio_segmento(COALESCE(l.tags, '{}'), c)
            )
          ELSE -- AND (padrão)
            NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(v_criterios) AS c
              WHERE NOT public.avaliar_criterio_segmento(COALESCE(l.tags, '{}'), c)
            )
        END
      );
  END IF;

  UPDATE public.base_segmentos
  SET contagem_leads = v_contagem, atualizado_contagem_em = now()
  WHERE id = p_segmento_id;

  RETURN v_contagem;
END;
$$;

-- 4. RPC: mover lead para a Base (manual + automático)
CREATE OR REPLACE FUNCTION public.descer_lead_pra_base(
  p_lead_id uuid,
  p_motivo  text DEFAULT 'manual'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_tenant_id uuid;
BEGIN
  v_caller_id := (SELECT auth.uid());

  SELECT l.tenant_id INTO v_tenant_id
  FROM public.leads l
  WHERE l.id = p_lead_id
    AND l.deleted_at IS NULL
    AND (
      l.tenant_id = v_caller_id
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_caller_id AND p.parent_user_id = l.tenant_id
      )
    );

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'lead não encontrado ou acesso negado';
  END IF;

  UPDATE public.leads
  SET location = 'base', updated_at = now()
  WHERE id = p_lead_id
    AND location != 'base'
    AND deleted_at IS NULL;

  RETURN FOUND;
END;
$$;
;

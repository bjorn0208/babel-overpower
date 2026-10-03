-- Migration 05 · migrar_campanhas_filtros
-- Converte filters.tags (legado) → filters.criterios (formato canônico v2)
-- Idempotente: pula campanha que já tem criterios

CREATE OR REPLACE FUNCTION public.migrar_filtros_campanha(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_filters       jsonb;
  v_tags          text[];
  v_tag           text;
  v_key           text;
  v_val           text;
  v_chave_can     text;
  v_valor_can     text;
  v_alias_chave   text;
  v_alias_valor   text;
  v_map           jsonb := '{}'::jsonb;
  v_criterios     jsonb;
BEGIN
  SELECT filters INTO v_filters FROM public.campaigns WHERE id = p_campaign_id;
  IF v_filters IS NULL THEN RETURN; END IF;

  -- idempotente: já migrado
  IF v_filters ? 'criterios' THEN RETURN; END IF;

  SELECT ARRAY(SELECT jsonb_array_elements_text(v_filters -> 'tags'))
  INTO v_tags;

  IF v_tags IS NULL OR array_length(v_tags, 1) IS NULL THEN
    UPDATE public.campaigns
    SET filters = v_filters
      || jsonb_build_object(
           'criterios',       '[]'::jsonb,
           'operador_global', 'AND',
           'legado_backup',   v_filters)
    WHERE id = p_campaign_id;
    RETURN;
  END IF;

  FOREACH v_tag IN ARRAY v_tags LOOP
    v_key := split_part(v_tag, ':', 1);
    v_val := CASE
               WHEN position(':' IN v_tag) > 0
               THEN substring(v_tag FROM position(':' IN v_tag) + 1)
               ELSE ''
             END;

    -- lookup alias exato (chave:valor)
    SELECT tva.chave_canonica, tva.valor_canonico
    INTO   v_alias_chave, v_alias_valor
    FROM   public.tag_vocabulario_alias tva
    WHERE  tva.alias = v_tag AND tva.escopo = 'plataforma'
    LIMIT  1;

    IF FOUND THEN
      v_chave_can := v_alias_chave;
      v_valor_can := v_alias_valor;
    ELSE
      -- lookup só pela chave
      SELECT tva.chave_canonica, tva.valor_canonico
      INTO   v_alias_chave, v_alias_valor
      FROM   public.tag_vocabulario_alias tva
      WHERE  tva.alias = v_key AND tva.escopo = 'plataforma'
      LIMIT  1;

      IF FOUND THEN
        v_chave_can := v_alias_chave;
        v_valor_can := COALESCE(NULLIF(v_val, ''), v_alias_valor);
      ELSE
        v_chave_can := v_key;
        v_valor_can := COALESCE(NULLIF(v_val, ''), v_key);
      END IF;
    END IF;

    -- agrupar por chave no map
    IF v_map ? v_chave_can THEN
      v_map := jsonb_set(v_map, ARRAY[v_chave_can],
               (v_map -> v_chave_can) || to_jsonb(v_valor_can));
    ELSE
      v_map := v_map || jsonb_build_object(v_chave_can, jsonb_build_array(v_valor_can));
    END IF;
  END LOOP;

  -- map → array de critérios
  SELECT jsonb_agg(
    jsonb_build_object('chave', k.key, 'operador', 'in', 'valores', k.value)
  )
  INTO v_criterios
  FROM jsonb_each(v_map) AS k;

  UPDATE public.campaigns
  SET filters = v_filters
    || jsonb_build_object(
         'criterios',       COALESCE(v_criterios, '[]'::jsonb),
         'operador_global', COALESCE(v_filters ->> 'operator', 'AND'),
         'legado_backup',   v_filters)
  WHERE id = p_campaign_id;
END;
$$;

-- Rodar pra todas as campanhas existentes
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.campaigns LOOP
    PERFORM public.migrar_filtros_campanha(v_id);
  END LOOP;
END;
$$;
;

CREATE OR REPLACE FUNCTION public.avaliar_criterio_segmento(p_tags text[], p_criterio jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$


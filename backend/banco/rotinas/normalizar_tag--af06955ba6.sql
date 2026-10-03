CREATE OR REPLACE FUNCTION public.normalizar_tag(p_tag_text text, p_tenant_id uuid, p_nicho_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(chave_canonica text, valor_canonico text, vocabulario_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_chave_raw text;
  v_valor_raw text;
  v_pos int;
BEGIN
  IF p_tag_text IS NULL OR length(trim(p_tag_text)) = 0 THEN
    RETURN;
  END IF;

  v_pos := position(':' IN p_tag_text);
  IF v_pos > 0 THEN
    v_chave_raw := lower(trim(substring(p_tag_text FROM 1 FOR v_pos - 1)));
    v_valor_raw := lower(trim(substring(p_tag_text FROM v_pos + 1)));
  ELSE
    v_chave_raw := lower(trim(p_tag_text));
    v_valor_raw := NULL;
  END IF;

  RETURN QUERY
  SELECT a.chave_canonica, COALESCE(a.valor_canonico, v_valor_raw), v.id
  FROM public.alias_vocabulario_tag a
  LEFT JOIN public.vocabulario_curadoria v
    ON v.chave = a.chave_canonica
    AND (v.escopo = 'plataforma'
         OR (v.escopo = 'nicho' AND v.nicho_id = p_nicho_id)
         OR (v.escopo = 'tenant' AND v.tenant_id = p_tenant_id))
    AND v.ativo
  WHERE lower(a.alias) = v_chave_raw
    AND (a.escopo = 'plataforma'
         OR (a.escopo = 'nicho' AND a.nicho_id = p_nicho_id)
         OR (a.escopo = 'tenant' AND a.tenant_id = p_tenant_id))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT v.chave, COALESCE(v_valor_raw, v.valor), v.id
    FROM public.vocabulario_curadoria v
    WHERE lower(v.chave) = v_chave_raw
      AND v.ativo
      AND (v.escopo = 'plataforma'
           OR (v.escopo = 'nicho' AND v.nicho_id = p_nicho_id)
           OR (v.escopo = 'tenant' AND v.tenant_id = p_tenant_id))
    ORDER BY CASE v.escopo WHEN 'tenant' THEN 1 WHEN 'nicho' THEN 2 ELSE 3 END
    LIMIT 1;
  END IF;
END;
$function$


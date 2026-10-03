CREATE OR REPLACE FUNCTION public.recalcular_contagem_segmento(p_segmento_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$


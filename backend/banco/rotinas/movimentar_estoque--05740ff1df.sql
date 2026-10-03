CREATE OR REPLACE FUNCTION public.movimentar_estoque(p_item_id uuid, p_tipo text, p_quantidade integer, p_motivo text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_nova integer;
BEGIN
  IF p_tipo NOT IN ('entrada', 'saida', 'ajuste') THEN
    RAISE EXCEPTION 'tipo de movimentação inválido: %', p_tipo;
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 0 THEN
    RAISE EXCEPTION 'quantidade inválida';
  END IF;
  UPDATE public.estoque_itens
  SET quantidade = CASE p_tipo
        WHEN 'entrada' THEN quantidade + p_quantidade
        WHEN 'saida' THEN quantidade - p_quantidade
        ELSE p_quantidade
      END,
      updated_at = now()
  WHERE id = p_item_id AND deleted_at IS NULL
  RETURNING quantidade INTO v_nova;
  IF v_nova IS NULL THEN
    RAISE EXCEPTION 'item de estoque não encontrado';
  END IF;
  INSERT INTO public.estoque_movimentacoes (tenant_id, item_id, tipo, quantidade, motivo)
  SELECT tenant_id, id, p_tipo, p_quantidade, p_motivo
  FROM public.estoque_itens WHERE id = p_item_id;
  RETURN v_nova;
END;
$function$


CREATE OR REPLACE FUNCTION public.criar_pedido_loja(p_tipo text, p_item_id uuid, p_comprovante_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_nome text;
  v_preco numeric;
  v_pedido uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  IF p_tipo = 'plano' THEN
    SELECT nome, preco_mensal INTO v_nome, v_preco
      FROM public.loja_planos WHERE id = p_item_id AND is_active = true;
  ELSIF p_tipo = 'pacote_extra' THEN
    SELECT nome, preco INTO v_nome, v_preco
      FROM public.loja_pacotes_extra WHERE id = p_item_id AND is_active = true;
  ELSIF p_tipo = 'plus' THEN
    SELECT nome, preco INTO v_nome, v_preco
      FROM public.loja_plus WHERE id = p_item_id AND is_active = true;
  ELSIF p_tipo = 'implantacao' THEN
    SELECT nome, preco INTO v_nome, v_preco
      FROM public.loja_implantacao WHERE id = p_item_id AND is_active = true;
  ELSE
    RAISE EXCEPTION 'tipo_invalido';
  END IF;

  IF v_preco IS NULL THEN
    RAISE EXCEPTION 'item_indisponivel';
  END IF;

  INSERT INTO public.pedidos_compra
    (user_id, tipo, item_id, item_nome, item_preco, comprovante_url, status)
  VALUES
    (v_uid, p_tipo, p_item_id, v_nome, v_preco, p_comprovante_url, 'pendente')
  RETURNING id INTO v_pedido;

  RETURN v_pedido;
END;
$function$


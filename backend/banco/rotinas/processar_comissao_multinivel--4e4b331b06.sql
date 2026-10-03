CREATE OR REPLACE FUNCTION public.processar_comissao_multinivel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_valor numeric;
  v_current_id uuid;
  v_nivel int := 0;
  v_max_nivel int;
  v_nivel_valor numeric;
  v_nivel_tipo_valor text;
  v_comissao numeric;
  v_is_ativo boolean;
  v_tipo_produto text;
BEGIN
  -- So processa quando entra em 'aprovado'
  IF NEW.status != 'aprovado' THEN RETURN NEW; END IF;
  -- Em UPDATE, só na transição para aprovado (evita reprocessar). Em INSERT,
  -- OLD não existe, então não pode ser referenciado.
  IF TG_OP = 'UPDATE' AND OLD.status = 'aprovado' THEN RETURN NEW; END IF;

  v_user_id := NEW.user_id;
  v_valor := NEW.item_preco;
  v_tipo_produto := NEW.tipo;

  SELECT referred_by INTO v_current_id FROM profiles WHERE id = v_user_id;
  SELECT MAX(nivel) INTO v_max_nivel FROM multinivel_niveis WHERE tipo_produto = v_tipo_produto AND is_active = true;

  IF v_max_nivel IS NULL OR v_current_id IS NULL THEN
    RETURN NEW;
  END IF;

  WHILE v_current_id IS NOT NULL AND v_nivel < v_max_nivel LOOP
    v_nivel := v_nivel + 1;
    SELECT multinivel_ativo INTO v_is_ativo FROM profiles WHERE id = v_current_id;
    IF v_is_ativo IS NOT TRUE THEN
      SELECT referred_by INTO v_current_id FROM profiles WHERE id = v_current_id;
      CONTINUE;
    END IF;

    SELECT valor, tipo_valor INTO v_nivel_valor, v_nivel_tipo_valor
    FROM multinivel_niveis
    WHERE tipo_produto = v_tipo_produto AND nivel = v_nivel AND is_active = true;

    IF v_nivel_valor IS NULL THEN EXIT; END IF;

    IF v_nivel_tipo_valor = 'fixo' THEN
      v_comissao := ROUND(v_nivel_valor, 2);
    ELSE
      v_comissao := ROUND(v_valor * v_nivel_valor / 100, 2);
    END IF;

    IF v_comissao > 0 THEN
      INSERT INTO multinivel_comissoes (beneficiario_id, origem_id, purchase_order_id, nivel, percentual, valor_base, valor_comissao, status)
      VALUES (v_current_id, v_user_id, NEW.id, v_nivel, v_nivel_valor, v_valor, v_comissao, 'creditado');
      UPDATE profiles SET saldo_multinivel = COALESCE(saldo_multinivel, 0) + v_comissao WHERE id = v_current_id;
    END IF;

    SELECT referred_by INTO v_current_id FROM profiles WHERE id = v_current_id;
  END LOOP;

  RETURN NEW;
END;
$function$


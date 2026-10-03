CREATE OR REPLACE FUNCTION public.solicitar_saque(p_valor numeric, p_chave_pix text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo numeric;
  v_saque_id uuid;
BEGIN
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor do saque deve ser positivo';
  END IF;

  SELECT saldo_multinivel INTO v_saldo
  FROM profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF v_saldo IS NULL OR v_saldo < p_valor THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  UPDATE profiles
  SET saldo_multinivel = saldo_multinivel - p_valor
  WHERE id = auth.uid();

  INSERT INTO multinivel_saques (user_id, valor, chave_pix, status)
  VALUES (auth.uid(), p_valor, p_chave_pix, 'pendente')
  RETURNING id INTO v_saque_id;

  RETURN v_saque_id;
END;
$function$


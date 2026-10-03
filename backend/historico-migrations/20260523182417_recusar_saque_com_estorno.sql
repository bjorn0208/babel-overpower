
-- Recusar saque devolvendo o saldo (solicitar_saque debita na solicitação; recusar precisa estornar).
-- Idempotente: só estorna saque ainda 'pendente'. Só admin da plataforma.
CREATE OR REPLACE FUNCTION public.recusar_saque(p_saque_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid;
  v_valor numeric;
  v_status text;
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RAISE EXCEPTION 'Apenas admin da plataforma pode recusar saque';
  END IF;

  SELECT user_id, valor, status
    INTO v_user, v_valor, v_status
  FROM public.multinivel_saques
  WHERE id = p_saque_id
  FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Saque nao encontrado';
  END IF;

  -- Idempotência: estorno só do saque pendente (evita devolver saldo duas vezes).
  IF v_status <> 'pendente' THEN
    RETURN;
  END IF;

  UPDATE public.multinivel_saques
  SET status = 'recusado', updated_at = now()
  WHERE id = p_saque_id;

  UPDATE public.profiles
  SET saldo_multinivel = COALESCE(saldo_multinivel, 0) + v_valor
  WHERE id = v_user;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recusar_saque(uuid) TO authenticated;

;

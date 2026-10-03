CREATE OR REPLACE FUNCTION public.resolver_codigo_indicacao(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE referral_code = p_code
  LIMIT 1;

  RETURN v_user_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.email_de_apelido(p_apelido text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'extensions'
AS $function$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email
  FROM public.profiles
  WHERE apelido = p_apelido::extensions.citext
    AND account_status = 'ativo'
    AND is_active = true
  LIMIT 1;
  RETURN v_email;
END;
$function$


-- Fix: search_path vazio esconde o operador `=` do extensions.citext (case-insensitive).
-- Caused by: CREATE EXTENSION citext WITH SCHEMA extensions; operadores ficam só nesse schema.
-- Solução: search_path = 'extensions' permite resolver o operador, e public.profiles continua qualificado.
CREATE OR REPLACE FUNCTION public.email_de_apelido(p_apelido text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'extensions'
STABLE
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.email_de_apelido(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_de_apelido(text) TO service_role;
;

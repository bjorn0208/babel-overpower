-- Fix: a coluna account_status do projeto usa pt-BR ('ativo') e não 'active'.
-- Bug descoberto em 2026-05-14 03:15 BRT ao testar lookup pela primeira vez.
CREATE OR REPLACE FUNCTION public.email_de_apelido(p_apelido text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

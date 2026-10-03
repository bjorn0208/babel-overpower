CREATE OR REPLACE FUNCTION public.fn_rifas_gerar_codigo_controle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prefixo text;
  v_seq int;
BEGIN
  IF NEW.codigo_controle IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_prefixo := 'R' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DDMMYY');

  SELECT COALESCE(MAX((substring(codigo_controle from 8 for 2))::int), -1) + 1
    INTO v_seq
    FROM public.rifas
    WHERE tenant_id = NEW.tenant_id
      AND codigo_controle LIKE v_prefixo || '%';

  NEW.codigo_controle := v_prefixo || lpad(v_seq::text, 2, '0');
  RETURN NEW;
END;
$function$


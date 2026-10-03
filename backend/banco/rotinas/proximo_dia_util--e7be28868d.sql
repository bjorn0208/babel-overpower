CREATE OR REPLACE FUNCTION public.proximo_dia_util(p_data date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_data date := p_data;
  v_max_iter int := 30;
BEGIN
  WHILE NOT public.eh_dia_util(v_data) AND v_max_iter > 0 LOOP
    v_data := v_data + 1;
    v_max_iter := v_max_iter - 1;
  END LOOP;
  RETURN v_data;
END;
$function$


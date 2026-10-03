CREATE OR REPLACE FUNCTION public.dia_util_do_mes(p_data_ref date, p_n integer)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ref date := COALESCE(p_data_ref, current_date);
  v_data date := date_trunc('month', v_ref)::date;
  v_fim_mes date := (date_trunc('month', v_ref) + interval '1 month - 1 day')::date;
  v_count int := 0;
BEGIN
  IF p_n IS NULL OR p_n <= 0 THEN
    RETURN NULL;
  END IF;
  WHILE v_data <= v_fim_mes LOOP
    IF public.eh_dia_util(v_data) THEN
      v_count := v_count + 1;
      IF v_count = p_n THEN
        RETURN v_data;
      END IF;
    END IF;
    v_data := v_data + 1;
  END LOOP;
  RETURN NULL;
END;
$function$


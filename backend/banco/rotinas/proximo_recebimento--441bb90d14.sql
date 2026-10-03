CREATE OR REPLACE FUNCTION public.proximo_recebimento(p_padrao text, p_ref date DEFAULT NULL::date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ref date := COALESCE(p_ref, current_date);
  v_n int;
  v_dia int;
  v_data date;
  v_fim_mes date;
BEGIN
  IF p_padrao IS NULL OR length(p_padrao) = 0 THEN
    RETURN NULL;
  END IF;

  IF p_padrao LIKE 'dia_util_n:%' THEN
    v_n := substring(p_padrao FROM 12)::int;
    v_data := public.dia_util_do_mes(v_ref, v_n);
    IF v_data IS NULL OR v_data < v_ref THEN
      v_data := public.dia_util_do_mes((date_trunc('month', v_ref) + interval '1 month')::date, v_n);
    END IF;
    RETURN v_data;
  END IF;

  IF p_padrao LIKE 'dia_%' AND p_padrao NOT LIKE 'dia_util%' THEN
    v_dia := substring(p_padrao FROM 5)::int;
    IF v_dia < 1 OR v_dia > 31 THEN RETURN NULL; END IF;
    v_data := make_date(extract(year FROM v_ref)::int, extract(month FROM v_ref)::int, v_dia);
    IF v_data < v_ref THEN
      v_data := (date_trunc('month', v_ref) + interval '1 month')::date + (v_dia - 1);
    END IF;
    RETURN public.proximo_dia_util(v_data);
  END IF;

  IF p_padrao = 'fim_mes' THEN
    v_fim_mes := (date_trunc('month', v_ref) + interval '1 month - 1 day')::date;
    WHILE NOT public.eh_dia_util(v_fim_mes) LOOP
      v_fim_mes := v_fim_mes - 1;
    END LOOP;
    RETURN v_fim_mes;
  END IF;

  RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.parse_tempo_relativo(p_str text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_str        text;
  v_days       int := 0;
  v_hours      int := 0;
  v_minutes    int := 0;
  v_match      text[];
  v_interval   interval;
BEGIN
  IF p_str IS NULL OR trim(p_str) = '' THEN
    RETURN NULL;
  END IF;

  v_str := trim(p_str);

  -- Tenta ISO 8601 direto (começa com dígito ou contém 'T')
  IF v_str !~ '^\+' THEN
    BEGIN
      RETURN v_str::timestamptz;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  END IF;

  -- Remove o prefixo '+'
  v_str := substr(v_str, 2);

  -- Extrai dias: Nd ou Ndays
  v_match := regexp_match(v_str, '^(\d+)d');
  IF v_match IS NOT NULL THEN
    v_days := v_match[1]::int;
    v_str  := regexp_replace(v_str, '^\d+d', '');
  END IF;

  -- Extrai horas: Nh ou Nhours
  v_match := regexp_match(v_str, '^(\d+)h');
  IF v_match IS NOT NULL THEN
    v_hours := v_match[1]::int;
    v_str   := regexp_replace(v_str, '^\d+h', '');
  END IF;

  -- Extrai minutos: Nmin ou Nminutes
  v_match := regexp_match(v_str, '^(\d+)min');
  IF v_match IS NOT NULL THEN
    v_minutes := v_match[1]::int;
    v_str     := regexp_replace(v_str, '^\d+min', '');
  END IF;

  -- Se sobrou algo que não é vazio, formato inválido
  IF trim(v_str) <> '' THEN
    RETURN NULL;
  END IF;

  -- Se nenhum componente foi extraído, inválido
  IF v_days = 0 AND v_hours = 0 AND v_minutes = 0 THEN
    RETURN NULL;
  END IF;

  v_interval := make_interval(days => v_days, hours => v_hours, mins => v_minutes);
  RETURN now() + v_interval;
END;
$function$


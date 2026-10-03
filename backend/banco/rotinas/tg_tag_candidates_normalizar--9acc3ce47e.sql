CREATE OR REPLACE FUNCTION public.tg_tag_candidates_normalizar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  r record;
BEGIN
  IF NEW.tag_text IS NULL OR length(trim(NEW.tag_text)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO r FROM public.normalizar_tag(NEW.tag_text, NEW.tenant_id, NEW.nicho_id) LIMIT 1;

  IF FOUND THEN
    NEW.chave_canonica := r.chave_canonica;
    NEW.valor_canonico := r.valor_canonico;
    NEW.vocabulario_id := r.vocabulario_id;
    NEW.normalizado_em := now();
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_anti_n1_tag_candidates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status IN ('approved','promoted','aprovado') AND OLD.status NOT IN ('approved','promoted','aprovado') THEN
    IF NEW.num_leads_independentes < 5 THEN
      RAISE EXCEPTION 'tag_candidate %: anti-N=1 bloqueia promoção — num_leads_independentes=% (mínimo: 5).',
        NEW.id, NEW.num_leads_independentes USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


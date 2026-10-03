CREATE OR REPLACE FUNCTION public.fn_trg_registrar_cruzamento_score_faixa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_faixa_antiga text; v_faixa_nova text;
BEGIN
  IF NEW.score_lead IS NULL OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  v_faixa_nova := public.score_lead_faixa(NEW.score_lead);
  v_faixa_antiga := CASE WHEN OLD.score_lead IS NULL THEN NULL ELSE public.score_lead_faixa(OLD.score_lead) END;
  IF v_faixa_antiga IS DISTINCT FROM v_faixa_nova THEN
    BEGIN INSERT INTO public.gatilhos_score_lead (conversa_id, lead_id, tenant_id, score, faixa_anterior, faixa_nova)
      VALUES (NEW.id, NEW.lead_id, NEW.tenant_id, NEW.score_lead, v_faixa_antiga, v_faixa_nova);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END; $function$


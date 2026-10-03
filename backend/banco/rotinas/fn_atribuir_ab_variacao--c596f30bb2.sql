CREATE OR REPLACE FUNCTION public.fn_atribuir_ab_variacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_config jsonb;
  v_count_a integer;
  v_count_b integer;
BEGIN
  SELECT ab_test_config INTO v_config
  FROM public.campanhas
  WHERE id = NEW.campaign_id;

  -- Só age se o teste A/B está ativo
  IF v_config IS NULL OR NOT coalesce((v_config->>'ativo')::boolean, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count_a
  FROM public.leads_campanha
  WHERE campaign_id = NEW.campaign_id AND ab_variacao = 'a';

  SELECT COUNT(*) INTO v_count_b
  FROM public.leads_campanha
  WHERE campaign_id = NEW.campaign_id AND ab_variacao = 'b';

  NEW.ab_variacao := CASE WHEN v_count_a <= v_count_b THEN 'a' ELSE 'b' END;
  RETURN NEW;
END;
$function$


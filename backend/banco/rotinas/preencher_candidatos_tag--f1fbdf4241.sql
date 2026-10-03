CREATE OR REPLACE FUNCTION public.preencher_candidatos_tag(p_nicho_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_inseridos integer := 0;
BEGIN
  IF p_nicho_id IS NULL THEN RAISE EXCEPTION 'nicho_id obrigatorio'; END IF;
  WITH agg AS (
    SELECT unnest(l.tags) AS tag_text, count(DISTINCT l.id) AS num_leads, count(*) AS num_obs,
      array_agg(DISTINCT l.id) FILTER (WHERE l.id IS NOT NULL) AS evidence
    FROM public.leads l JOIN public.profiles p ON p.id = l.tenant_id
    WHERE p.nicho_id = p_nicho_id AND l.tags IS NOT NULL AND array_length(l.tags, 1) > 0
    GROUP BY 1
  ),
  ins AS (
    INSERT INTO public.candidatos_tag (nicho_id, tag_text, num_observacoes, num_leads_independentes, evidencia_lead_ids, status, criado_em, atualizado_em)
    SELECT p_nicho_id, a.tag_text, a.num_obs, a.num_leads, (a.evidence)[1:5], 'pendente', now(), now() FROM agg a
    ON CONFLICT (nicho_id, tag_text) DO UPDATE
    SET num_observacoes = EXCLUDED.num_observacoes, num_leads_independentes = EXCLUDED.num_leads_independentes,
        evidencia_lead_ids = EXCLUDED.evidencia_lead_ids, atualizado_em = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridos FROM ins;
  RETURN v_inseridos;
END;
$function$


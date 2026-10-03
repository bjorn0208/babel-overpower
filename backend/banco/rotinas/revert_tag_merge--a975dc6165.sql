CREATE OR REPLACE FUNCTION public.revert_tag_merge(p_log_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_log public.registro_fusao_tag%ROWTYPE; v_revert integer := 0;
BEGIN
  SELECT * INTO v_log FROM public.registro_fusao_tag WHERE id = p_log_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'log nao encontrado'; END IF;
  IF v_log.applied_at < now() - interval '90 days' THEN RAISE EXCEPTION 'janela de 90 dias expirou'; END IF;
  WITH afetados AS (
    UPDATE public.leads SET tags = (SELECT array_agg(DISTINCT t) FROM (SELECT unnest(tags) AS t UNION SELECT v_log.tag_origem) z)
    FROM public.profiles p
    WHERE p.id = public.leads.tenant_id AND p.nicho_id = v_log.nicho_id AND public.leads.tags @> ARRAY[v_log.tag_destino]
    RETURNING public.leads.id
  )
  SELECT count(*) INTO v_revert FROM afetados;
  INSERT INTO public.candidatos_tag (nicho_id, tag_text, num_observacoes, num_leads_independentes, evidencia_lead_ids, status, criado_em, atualizado_em)
  VALUES (v_log.nicho_id, v_log.tag_origem, v_log.num_observacoes_movidas, v_log.num_observacoes_movidas, ARRAY[]::uuid[], 'pendente', now(), now())
  ON CONFLICT (nicho_id, tag_text) DO UPDATE
  SET num_leads_independentes = EXCLUDED.num_leads_independentes, atualizado_em = now();
  UPDATE public.sugestoes_fusao_tag SET status = 'rejeitado', decided_at = now() WHERE id = v_log.origem_suggestion_id;
  DELETE FROM public.registro_fusao_tag WHERE id = p_log_id;
  RETURN v_revert;
END;
$function$


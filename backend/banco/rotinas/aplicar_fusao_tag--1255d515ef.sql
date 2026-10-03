CREATE OR REPLACE FUNCTION public.aplicar_fusao_tag(p_suggestion_id uuid, p_canonical text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_sug      public.sugestoes_fusao_tag%ROWTYPE;
  v_destino  text;
  v_origens  text[];
  v_origem   text;
  v_leads_atualizados integer := 0;
  v_total integer := 0;
  v_user     uuid;
BEGIN
  v_user := auth.uid();
  SELECT * INTO v_sug FROM public.sugestoes_fusao_tag WHERE id = p_suggestion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sugestao nao encontrada'; END IF;
  IF v_sug.status NOT IN ('pending', 'pendente') THEN RAISE EXCEPTION 'sugestao ja decidida (status=%)', v_sug.status; END IF;
  v_destino := COALESCE(p_canonical, v_sug.suggested_canonical);
  IF v_sug.tags IS NOT NULL AND array_length(v_sug.tags, 1) > 0 THEN
    v_origens := array(SELECT t FROM unnest(v_sug.tags) t WHERE t <> v_destino);
  ELSE
    v_origens := array(SELECT t FROM unnest(ARRAY[v_sug.tag_a, v_sug.tag_b]) t WHERE t <> v_destino AND t IS NOT NULL);
  END IF;
  IF array_length(v_origens, 1) IS NULL OR array_length(v_origens, 1) = 0 THEN
    RAISE EXCEPTION 'nenhuma tag origem (canonical %s sozinha?)', v_destino;
  END IF;
  FOREACH v_origem IN ARRAY v_origens LOOP
    WITH afetados AS (
      UPDATE public.leads
      SET tags = (SELECT array_agg(DISTINCT t) FROM (SELECT CASE WHEN x = v_origem THEN v_destino ELSE x END AS t FROM unnest(tags) x) z)
      FROM public.profiles p
      WHERE p.id = public.leads.tenant_id AND p.nicho_id = v_sug.nicho_id AND public.leads.tags @> ARRAY[v_origem]
      RETURNING public.leads.id
    )
    SELECT count(*) INTO v_leads_atualizados FROM afetados;
    UPDATE public.candidatos_tag
    SET num_leads_independentes = num_leads_independentes + COALESCE((SELECT num_leads_independentes FROM public.candidatos_tag WHERE nicho_id = v_sug.nicho_id AND tag_text = v_origem), 0), atualizado_em = now()
    WHERE nicho_id = v_sug.nicho_id AND tag_text = v_destino;
    DELETE FROM public.candidatos_tag WHERE nicho_id = v_sug.nicho_id AND tag_text = v_origem;
    UPDATE public.observacoes_tag o SET tag_text = v_destino FROM public.profiles p WHERE p.id = o.tenant_id AND p.nicho_id = v_sug.nicho_id AND o.tag_text = v_origem;
    INSERT INTO public.registro_fusao_tag (nicho_id, tag_origem, tag_destino, num_observacoes_movidas, applied_at, applied_by, origem_suggestion_id)
    VALUES (v_sug.nicho_id, v_origem, v_destino, v_leads_atualizados, now(), v_user, p_suggestion_id);
    v_total := v_total + v_leads_atualizados;
  END LOOP;
  UPDATE public.sugestoes_fusao_tag SET status = 'aprovado', decided_at = now(), decided_by = v_user WHERE id = p_suggestion_id;
  RETURN v_total;
END;
$function$


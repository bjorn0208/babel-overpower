CREATE OR REPLACE FUNCTION public.memoria_lead_similar(p_lead_id uuid, p_embedding extensions.halfvec, p_threshold double precision DEFAULT 0.85, p_top_k integer DEFAULT 5)
 RETURNS TABLE(id uuid, fato text, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  -- Gate anti-duplicado Mem0-style:
  -- Retorna fatos semanticamente similares para o lead especificado.
  -- Se retornar rows: fato já existe semanticamente → NOOP/UPDATE.
  -- Se retornar vazio: fato novo → ADD.
  -- Filtro duplo lead_id + tenant_id garante isolamento por lead E por tenant (anti-LGPD-break).
  -- fonte != 'teste': fixtures de teste não contaminam busca de produção (anti-envenenamento Wave 0).
  SELECT
    lm.id,
    lm.fato,
    1.0 - (lm.vetor_semantico <=> p_embedding) AS similarity
  FROM public.memoria_lead lm
  WHERE lm.lead_id           = p_lead_id
    AND lm.tenant_id         = (select auth.uid())
    AND lm.ativa             = true
    AND lm.embedding_status  = 'ready'
    AND lm.fonte             != 'teste'
    AND (1.0 - (lm.vetor_semantico <=> p_embedding)) >= p_threshold
  ORDER BY lm.vetor_semantico <=> p_embedding ASC
  LIMIT p_top_k;
$function$


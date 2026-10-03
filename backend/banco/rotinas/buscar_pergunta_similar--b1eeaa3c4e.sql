CREATE OR REPLACE FUNCTION public.buscar_pergunta_similar(p_tenant_id uuid, p_embedding extensions.halfvec, p_limiar double precision DEFAULT 0.88)
 RETURNS TABLE(id uuid, pergunta text, resposta_do_dono text, status_loop text, ocorrencias integer, bloco_criado_id uuid, similaridade double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT ps.id, ps.pergunta, ps.resposta_do_dono, ps.status_loop, ps.ocorrencias,
         ps.bloco_criado_id,
         1 - (ps.vetor_semantico OPERATOR(extensions.<=>) p_embedding) AS similaridade
  FROM public.perguntas_sem_resposta ps
  WHERE ps.tenant_id = p_tenant_id
    AND ps.vetor_semantico IS NOT NULL
    AND (ps.status_loop = 'aguardando_dono' OR ps.resposta_do_dono IS NOT NULL)
    AND 1 - (ps.vetor_semantico OPERATOR(extensions.<=>) p_embedding) >= p_limiar
  ORDER BY ps.vetor_semantico OPERATOR(extensions.<=>) p_embedding
  LIMIT 1;
$function$


-- Ajuste: dedup precisa de `ocorrencias` no retorno pro incremento sem query extra.
DROP FUNCTION IF EXISTS public.buscar_pergunta_similar(uuid, extensions.halfvec, double precision);
CREATE OR REPLACE FUNCTION public.buscar_pergunta_similar(
  p_tenant_id uuid,
  p_embedding extensions.halfvec,
  p_limiar double precision DEFAULT 0.88
)
RETURNS TABLE (
  id uuid,
  pergunta text,
  resposta_do_dono text,
  status_loop text,
  ocorrencias integer,
  similaridade double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ps.id, ps.pergunta, ps.resposta_do_dono, ps.status_loop, ps.ocorrencias,
         1 - (ps.vetor_semantico OPERATOR(extensions.<=>) p_embedding) AS similaridade
  FROM public.perguntas_sem_resposta ps
  WHERE ps.tenant_id = p_tenant_id
    AND ps.vetor_semantico IS NOT NULL
    AND (ps.status_loop = 'aguardando_dono' OR ps.resposta_do_dono IS NOT NULL)
    AND 1 - (ps.vetor_semantico OPERATOR(extensions.<=>) p_embedding) >= p_limiar
  ORDER BY ps.vetor_semantico OPERATOR(extensions.<=>) p_embedding
  LIMIT 1;
$$;
;

-- Dedup semântico do pipeline de curiosidade (2026-06-11): antes de criar pergunta pro dono,
-- o motor compara o embedding da pergunta formulada com as já existentes do tenant.
-- Top-1 entre ABERTAS (aguardando_dono) e RESPONDIDAS (resposta_do_dono preenchida).
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
  similaridade double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ps.id, ps.pergunta, ps.resposta_do_dono, ps.status_loop,
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

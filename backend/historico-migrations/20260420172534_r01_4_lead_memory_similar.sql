
-- UP: r01_4_lead_memory_similar
-- Wave 0 / R01.4 — RPC gate anti-duplicado para lead_memory (Motor Vivo)
-- INVIOLÁVEL: p_lead_id sem DEFAULT — obrigatório no call. Anti-vazamento entre leads.
-- search_path TO 'public', 'extensions' — padrão das RPCs vetoriais do projeto

CREATE OR REPLACE FUNCTION public.lead_memory_similar(
  p_lead_id   uuid,
  p_embedding halfvec,
  p_threshold double precision DEFAULT 0.85,
  p_top_k     integer          DEFAULT 5
)
RETURNS TABLE(
  id         uuid,
  fato       text,
  similarity double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  -- Gate anti-duplicado Mem0-style:
  -- Retorna fatos semanticamente similares para o lead especificado.
  -- Se retornar rows: fato já existe semanticamente → NOOP/UPDATE.
  -- Se retornar vazio: fato novo → ADD.
  -- Filtro duplo lead_id + tenant_id garante isolamento por lead E por tenant (anti-LGPD-break).
  SELECT
    lm.id,
    lm.fato,
    1.0 - (lm.embedding <=> p_embedding) AS similarity
  FROM public.lead_memory lm
  WHERE lm.lead_id    = p_lead_id
    AND lm.tenant_id  = (select auth.uid())
    AND lm.ativa      = true
    AND lm.embedding_status = 'ready'
    AND (1.0 - (lm.embedding <=> p_embedding)) >= p_threshold
  ORDER BY lm.embedding <=> p_embedding ASC
  LIMIT p_top_k;
$$;

COMMENT ON FUNCTION public.lead_memory_similar(uuid, halfvec, double precision, integer) IS
  'Gate anti-duplicado para lead_memory (R01.4 — Motor Vivo). '
  'p_lead_id OBRIGATÓRIO sem default — evita vazamento de memória entre leads (LGPD). '
  'Filtro duplo: lead_id = p_lead_id AND tenant_id = auth.uid(). '
  'Retorna fatos com similaridade cosine >= p_threshold (default 0.85).';

GRANT EXECUTE ON FUNCTION public.lead_memory_similar(uuid, halfvec, double precision, integer)
  TO authenticated, service_role;

;

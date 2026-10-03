
-- UP: r01_drop_v1_hybrid_search_knowledge
-- Wave 0 — Remove hybrid_search_knowledge v1 (10 params, sem p_nicho_id).
-- PRÉ-CONDIÇÃO: retrieve-router.ts já corrigido para passar p_nicho_id em TODAS as chamadas
-- (confirmado pelo agent codigo na Onda 0 pre-work).
-- V2 (11 params, com p_nicho_id) permanece intacta.

-- Dropar exatamente a assinatura v1 (10 parâmetros, sem p_nicho_id uuid)
DROP FUNCTION IF EXISTS public.hybrid_search_knowledge(
  text,        -- p_query_text
  halfvec,     -- p_query_embedding
  uuid,        -- p_agent_id
  text,        -- p_tipo
  text,        -- p_category
  integer,     -- p_match_count
  double precision, -- p_full_text_weight
  double precision, -- p_semantic_weight
  integer,     -- p_rrf_k
  text         -- p_tom
);

-- Validação pós-drop: deve existir APENAS 1 row (a v2 com 11 params)
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'hybrid_search_knowledge'
    AND pronamespace = 'public'::regnamespace;

  IF v_count != 1 THEN
    RAISE EXCEPTION
      'ERRO PÓS-DROP: esperado 1 versão de hybrid_search_knowledge, encontrado %. '
      'Verificar se v2 (11 params) existe antes de prosseguir.',
      v_count;
  END IF;
END;
$$;

;

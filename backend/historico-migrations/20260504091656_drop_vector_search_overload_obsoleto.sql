-- B2: Remove overload obsoleto de public.vector_search (sem p_exclude_categories).
-- Achado G1 da validação V1 RAG core (2026-05-04).
-- O overload canônico mantido é o que aceita p_exclude_categories (mais flexível —
-- permite passar array vazio [] para reproduzir comportamento do overload removido).
-- Nenhum caller TypeScript encontrado em supabase/functions/ ou frontend/.
-- ADR: docs/projetos/validacao-v1-rag-core/04-plano-correcoes.md §G1

DROP FUNCTION IF EXISTS public.vector_search(
  query_embedding vector,
  p_agent_id uuid,
  match_count integer,
  similarity_threshold double precision
);
;

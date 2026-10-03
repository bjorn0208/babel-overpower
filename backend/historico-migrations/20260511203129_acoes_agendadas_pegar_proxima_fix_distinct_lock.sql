-- Fix: Postgres nao permite DISTINCT ON + FOR UPDATE no mesmo SELECT.
-- Solucao: 2 niveis de CTE — outer faz DISTINCT ON (1 por conversa);
-- inner re-seleciona pelos ids com FOR UPDATE SKIP LOCKED.
CREATE OR REPLACE FUNCTION public.pegar_proxima_acao_agendada(
  p_limite int DEFAULT 50
) RETURNS SETOF public.acoes_agendadas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH 
    -- Nivel 1: 1 candidato por conversa (mais antigo primeiro)
    candidatos AS (
      SELECT DISTINCT ON (conversation_id) id
      FROM public.acoes_agendadas
      WHERE status = 'pendente'
        AND scheduled_at <= now()
      ORDER BY conversation_id, scheduled_at ASC, created_at ASC
      LIMIT p_limite
    ),
    -- Nivel 2: lock atomico dos ids candidatos com SKIP LOCKED
    travados AS (
      SELECT id
      FROM public.acoes_agendadas
      WHERE id IN (SELECT id FROM candidatos)
        AND status = 'pendente'
      FOR UPDATE SKIP LOCKED
    )
  UPDATE public.acoes_agendadas a
     SET status = 'processando',
         tentativas = COALESCE(a.tentativas, 0) + 1
    FROM travados t
   WHERE a.id = t.id
  RETURNING a.*;
END;
$$;
;

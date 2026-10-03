-- Fix 2026-06-11 · reaper de zumbis matava ações legítimas de backlog.
-- liberar_zumbis usa COALESCE(executed_at, created_at) < now()-15min; o claim
-- (pegar_proxima_acao_agendada) não setava executed_at, então ação criada há
-- >15min era morta no ciclo seguinte ao claim MESMO processando normal.
-- Correção: claim marca executed_at = now() (início do processamento);
-- a edge sobrescreve com o fim real no sucesso.
CREATE OR REPLACE FUNCTION public.pegar_proxima_acao_agendada(p_limite integer DEFAULT 50)
 RETURNS SETOF acoes_agendadas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         tentativas = COALESCE(a.tentativas, 0) + 1,
         executed_at = now()  -- início do processamento: reaper conta daqui, não da criação
    FROM travados t
   WHERE a.id = t.id
  RETURNING a.*;
END;
$function$;
;

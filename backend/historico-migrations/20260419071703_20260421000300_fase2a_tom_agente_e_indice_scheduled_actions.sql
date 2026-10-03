-- Fase 2A (Tarefa 1 — Módulo Campanha): preparação de banco pra reproposta e tom configurável.
--
-- JUSTIFICATIVA DAS ESCOLHAS:
--
-- 1) Coluna `tom_agente` em `public.user_agents`:
--    Candidatos avaliados: `user_agents`, `profiles.campaign_settings`, `prompt_config`, `agent_templates`.
--    - `agent_templates` foi dropada (migration `drop_templates_rewrite_policies`) — não existe mais.
--    - `prompt_config` é global (key/value), sem tenant — fora de escopo.
--    - `profiles.campaign_settings` é config de campanha (inatividade), mora no perfil, não no agente.
--    - `user_agents` É a entidade "agente do usuário" após clonagem do template (15 rows ativas,
--      `user_id NOT NULL`, `identidade/configuracao/fluxo jsonb`). Config de tom pertence ao agente
--      do tenant e sobrevive à clonagem (ao contrário de config num template inexistente).
--    Escolhi coluna dedicada (em vez de key em `configuracao jsonb`) pra:
--      - Aplicar CHECK constraint (só 'formal'/'informal'/'espelhado').
--      - Permitir SELECT direto no chat sem extração de jsonb.
--      - Indexar se necessário no futuro.
--
-- 2) Tags de tom em chunks:
--    Apenas `knowledge_chunks` e `behavior_chunks` têm coluna `tags text[]` hoje. Essas são as
--    tabelas onde "tom" faz sentido semântico (conhecimento de produto + comportamento de fala).
--    `trigger_chunks`, `human_chunks`, `variation_chunks` usam apenas categoria/subcategoria —
--    NÃO adicionamos `tags` agora (não é necessário pro escopo da Fase 2).
--    SEM backfill: chunks existentes ficam sem tag de tom. Semântica de retrieval:
--      - chunk sem tag 'formal'|'informal' → aceito em QUALQUER modo.
--      - chunk com tag 'formal' → só aparece quando agente configurado como formal OR espelhado
--        detectou tom formal no lead em runtime.
--      - idem 'informal'.
--    Retrieval ficará a cargo de edge fn (Fase 2B). NÃO tocamos em triggers de embedding.
--
-- 3) RPC `get_tom_agente`:
--    Facilita o chat e process-followups lerem a config sem JOIN manual. SECURITY DEFINER
--    + search_path vazio pra funcionar sob JWT do usuário (retorna tom do próprio agente)
--    e sob service_role (edge fn). STABLE pra cache de planner.
--
-- 4) Índice `idx_scheduled_actions_pending_worker`:
--    EXPLAIN confirma Seq Scan hoje (20.923 rows, 3.7ms). Índice parcial em status='pending'
--    evita bloat (executed/cancelled/failed são maioria e não interessam ao worker).
--    Aprovado pelo Theus pra entrar agora.

-- ============================================================
-- 1) ÍNDICE PARCIAL SCHEDULED_ACTIONS PENDENTES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_pending_worker
  ON public.scheduled_actions (scheduled_at)
  WHERE status = 'pending';

COMMENT ON INDEX public.idx_scheduled_actions_pending_worker IS
  'Índice parcial para o pick do worker (process-followups): SELECT ... WHERE status=pending AND scheduled_at<=now() ORDER BY scheduled_at. Aprovado pela Fase 2A da Tarefa 1.';

-- ============================================================
-- 2) COLUNA tom_agente EM user_agents (configuração de tom)
-- ============================================================
ALTER TABLE public.user_agents
  ADD COLUMN IF NOT EXISTS tom_agente text NOT NULL DEFAULT 'espelhado';

-- CHECK idempotente: remove se existir e recria com valores aprovados.
ALTER TABLE public.user_agents
  DROP CONSTRAINT IF EXISTS user_agents_tom_agente_check;

ALTER TABLE public.user_agents
  ADD CONSTRAINT user_agents_tom_agente_check
  CHECK (tom_agente IN ('formal', 'informal', 'espelhado'));

COMMENT ON COLUMN public.user_agents.tom_agente IS
  'Tom de comunicação do agente. formal/informal filtra chunks com tag equivalente. espelhado = runtime detecta tom do lead e escolhe. Default: espelhado.';

-- ============================================================
-- 3) RPC get_tom_agente
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_tom_agente(p_user_agent_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT tom_agente FROM public.user_agents WHERE id = p_user_agent_id),
    'espelhado'
  );
$$;

COMMENT ON FUNCTION public.get_tom_agente(uuid) IS
  'Retorna o tom configurado do agente (formal/informal/espelhado) ou espelhado se não existir. Consumida por chat/index.ts e process-followups pra decidir filtro de retrieval de chunks.';

-- Grant execute pra authenticated (JWT) e service_role (edge fns).
REVOKE ALL ON FUNCTION public.get_tom_agente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tom_agente(uuid) TO authenticated, service_role;

-- ============================================================
-- 4) DOCUMENTAÇÃO (semântica de tags) — sem DDL, só comentário
-- ============================================================
COMMENT ON COLUMN public.knowledge_chunks.tags IS
  'Tags livres + tags semânticas de tom. Valores reservados: formal, informal. Chunk sem tag de tom = aceito em qualquer modo de tom do agente. Chunk com tag formal/informal = filtrado pelo retrieval quando agente está no modo correspondente ou detectou o tom em runtime (espelhado).';

COMMENT ON COLUMN public.behavior_chunks.tags IS
  'Tags livres + tags semânticas de tom. Valores reservados: formal, informal. Semântica igual à de knowledge_chunks.tags.';

;

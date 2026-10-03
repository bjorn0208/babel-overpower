
-- ============================================================
-- Wave 1 Ajuste R01.3 — Engajamento histórico permanente
-- UP: Remove rolling-window jsonb de conversations e cria
--     tabela granular engajamento_turnos (histórico permanente)
-- DOWN: DROP TABLE engajamento_turnos; ALTER TABLE conversations ADD COLUMN engajamento_snapshot jsonb;
-- ============================================================

-- Passo A: remover coluna rolling-window (criada hoje, nenhum código escreve)
ALTER TABLE public.conversations
  DROP COLUMN IF EXISTS engajamento_snapshot;

-- Passo B: criar tabela de histórico granular permanente
CREATE TABLE IF NOT EXISTS public.engajamento_turnos (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id               uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id             uuid        NOT NULL,
  turno                 integer     NOT NULL,
  velocidade_resposta_s integer,        -- tempo (s) entre msg do agente e resposta do lead; NULL se primeiro turno
  comprimento_msg       integer,        -- caracteres da msg do lead neste turno
  tom_detectado         text,           -- preenchido assincronamente; NULL na criação
  criado_em             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, turno)
);

COMMENT ON TABLE public.engajamento_turnos IS
  'Camada 1 — histórico granular permanente de engajamento por turno (R01.3 Motor Vivo). '
  '1 row por turno por conversa. Nunca deletar (soft delete via conversation ON DELETE CASCADE). '
  'Camada 2: conversation_belief.belief_historico (rolling 5 working memory). '
  'Camada 3: lead_engagement (agregado pré-calculado para filtro rápido em Campanha).';

COMMENT ON COLUMN public.engajamento_turnos.velocidade_resposta_s IS
  'Segundos entre a última msg do agente e a resposta do lead. NULL no primeiro turno da conversa.';

COMMENT ON COLUMN public.engajamento_turnos.comprimento_msg IS
  'Número de caracteres da mensagem do lead neste turno. Proxy de engajamento qualitativo.';

COMMENT ON COLUMN public.engajamento_turnos.tom_detectado IS
  'Tom emocional detectado (ex: receptivo, resistente, ansioso). Preenchido assincronamente. NULL na criação.';

-- Índice 1: working memory rolling por conversa (chat lê últimos N turnos)
CREATE INDEX IF NOT EXISTS idx_engajamento_turnos_conv_turno
  ON public.engajamento_turnos (conversation_id, turno DESC);

-- Índice 2: Campanha filtra leads por padrão de engajamento long-term
CREATE INDEX IF NOT EXISTS idx_engajamento_turnos_lead_criado
  ON public.engajamento_turnos (lead_id, criado_em DESC);

-- Índice 3: analytics por tenant
CREATE INDEX IF NOT EXISTS idx_engajamento_turnos_tenant_criado
  ON public.engajamento_turnos (tenant_id, criado_em DESC);

-- RLS
ALTER TABLE public.engajamento_turnos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engajamento_tenant_all"
  ON public.engajamento_turnos
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

CREATE POLICY "engajamento_service_all"
  ON public.engajamento_turnos
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

;


-- =============================================================
-- R01.1 — Belief State: tabela conversation_belief
-- Rodada 01 / Motor Vivo / Plataforma Limpa
-- 2026-04-20
--
-- Decisões de arquitetura:
--   • 1 row por conversa (UNIQUE conversation_id) — rolling-window JSONB
--   • P2=C cravado: rolling-window 5 turnos, campo belief_historico array
--   • compromissos[] subcampo do JSONB belief (gate 4.4 cognitivo)
--   • tenant_id desnormalizado para RLS eficiente (evita JOIN com conversations)
--   • set_updated_at() reutilizada da Onda 0 (não duplicada)
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Tabela principal
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_belief (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id        uuid        NOT NULL,
  belief           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  resumo_agente    text,
  belief_historico jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 2. Comentários de documentação do contrato JSONB
-- ---------------------------------------------------------------
COMMENT ON TABLE public.conversation_belief IS
  'Working memory do agente por conversa (R01.1 — Motor Vivo). '
  '1 row por conversa. belief é rolling-window dos últimos 5 turnos. '
  'Subcampo compromissos[] registra auto-log do agente (o que ele disse/fez). '
  'belief_historico guarda snapshots dos últimos 5 beliefs para auditoria e ficha transparente.';

COMMENT ON COLUMN public.conversation_belief.belief IS
  'JSONB estruturado — contrato: {'
  '  "sintoma_observado": "string — o que o lead expressou",'
  '  "causa_inferida": "string — o que o lead provavelmente quis dizer",'
  '  "confianca": 0.7,'
  '  "objecao_detectada": "string|null",'
  '  "proxima_intencao": "string — o que o agente pretende fazer",'
  '  "compromissos": ['
  '    {"tipo": "preco_dito", "valor": "R$ 997 à vista", "turno": 3, "timestamp": "2026-04-20T10:00:00Z"},'
  '    {"tipo": "prazo_dito", "valor": "15 a 45 dias úteis", "turno": 3, "timestamp": "..."}'
  '  ]'
  '}. '
  'compromissos[] é o auto-log do agente: registra o que ele disse/fez neste turno '
  '(preço citado, prazo dito, garantia mencionada). Máximo recomendado: últimos 10 compromissos. '
  'Escrito por post-llm.ts após cada turno via UPSERT ON CONFLICT DO UPDATE.';

COMMENT ON COLUMN public.conversation_belief.resumo_agente IS
  'Narrativa em pt-BR em 1ª pessoa do agente sobre o que fez nesta conversa. '
  'Exemplo: "Cumprimentei o lead, apresentei o Limpa Nome, disse garantia 6 meses e preço R$ 997 à vista. Aguardo decisão." '
  'Destinado ao vendedor na FichaPensamentoAgente.tsx. Escrito pelo LLM, não derivado de compromissos[].';

COMMENT ON COLUMN public.conversation_belief.belief_historico IS
  'Array rolling de até 5 snapshots do belief. Cada snapshot: '
  '{"turno": N, "belief": {...}, "ts": "ISO8601"}. '
  'Ao gravar o turno 6, post-llm.ts remove o turno 1 (responsabilidade do código, não do banco). '
  'Usado por FichaPensamentoAgente.tsx para mostrar evolução do raciocínio do agente nos últimos 5 turnos.';

COMMENT ON COLUMN public.conversation_belief.tenant_id IS
  'Desnormalizado de conversations.tenant_id para RLS eficiente. '
  'Evita JOIN com conversations a cada leitura — UNIQUE index em conversation_id torna leitura <1ms.';

-- ---------------------------------------------------------------
-- 3. Índices adicionais
-- (UNIQUE em conversation_id já cria índice implícito — não duplicar)
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversation_belief_tenant
  ON public.conversation_belief(tenant_id);

CREATE INDEX IF NOT EXISTS idx_conversation_belief_updated
  ON public.conversation_belief(updated_at DESC);

-- ---------------------------------------------------------------
-- 4. RLS — Row Level Security
-- ---------------------------------------------------------------
ALTER TABLE public.conversation_belief ENABLE ROW LEVEL SECURITY;

-- Policy para authenticated: tenant isolation via tenant_id desnormalizado
-- Usa (select auth.uid()) para evitar initplan leak (regra inviolável)
CREATE POLICY "conversation_belief_tenant_all"
  ON public.conversation_belief
  FOR ALL
  TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

-- Policy para service_role: bypass total (edge functions chat/post-llm.ts)
-- service_role bypassa RLS por padrão no Supabase, mas policy explícita documenta intenção
-- e garante comportamento correto caso configuração mude
CREATE POLICY "conversation_belief_service_all"
  ON public.conversation_belief
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------
-- 5. Trigger updated_at — reutiliza set_updated_at() da Onda 0
-- (NÃO recria a função — apenas cria o trigger que a invoca)
-- ---------------------------------------------------------------
CREATE TRIGGER trg_set_updated_at_conversation_belief
  BEFORE UPDATE ON public.conversation_belief
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

;

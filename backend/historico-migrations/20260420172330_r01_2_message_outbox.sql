
-- UP: r01_2_message_outbox
-- Wave 0 / R01.2 — Outbox de mensagens (Motor Vivo)
-- Tabela de fila de saída entre o cérebro (chat) e a boca (process-followups).

CREATE TABLE IF NOT EXISTS public.message_outbox (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id        uuid        NOT NULL,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','sent','failed','superseded')),
  content          text        NOT NULL,
  bubble_order     integer     NOT NULL DEFAULT 0,
  scheduled_at     timestamptz NOT NULL DEFAULT now(),
  dispatched_at    timestamptz,
  delay_calculado_ms integer,
  engagement_level text,
  retries          integer     NOT NULL DEFAULT 0,
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error_reason     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.message_outbox IS
  'Fila de saída do agente (R01.2 — Motor Vivo). '
  'Chat grava bolhas aqui; process-followups lê e despacha no ritmo calculado. '
  'Status machine: pending → processing → sent | failed | superseded. '
  'superseded = nova mensagem do lead cancelou pendentes.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_message_outbox_tenant_id
  ON public.message_outbox (tenant_id);

CREATE INDEX IF NOT EXISTS idx_message_outbox_conv_bubble
  ON public.message_outbox (conversation_id, bubble_order);

CREATE INDEX IF NOT EXISTS idx_message_outbox_pending_scheduled
  ON public.message_outbox (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_message_outbox_sent_failed_dispatched
  ON public.message_outbox (status, dispatched_at DESC)
  WHERE status IN ('sent','failed');

-- Trigger updated_at reutilizando set_updated_at
CREATE TRIGGER trg_message_outbox_updated_at
  BEFORE UPDATE ON public.message_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Função de supersede — chamada EXPLICITAMENTE pelo edge function chat/index.ts
-- quando detecta nova mensagem do lead. NÃO dispara via trigger da própria tabela
-- para evitar loop infinito.
CREATE OR REPLACE FUNCTION public.trg_message_outbox_supersede()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Quando lead envia nova mensagem, marca bolhas pending anteriores como superseded.
  -- Chamado pelo chat/index.ts via RPC — não por trigger na message_outbox.
  UPDATE public.message_outbox
  SET status = 'superseded',
      updated_at = now()
  WHERE conversation_id = NEW.conversation_id
    AND status = 'pending'
    AND created_at < NEW.created_at;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_message_outbox_supersede() IS
  'Marca bolhas pending anteriores como superseded quando lead envia nova mensagem. '
  'Chamada via RPC pelo chat/index.ts — não atachada como trigger na message_outbox '
  'para evitar loop (UPDATE status → dispara UPDATE → loop).';

-- RLS
ALTER TABLE public.message_outbox ENABLE ROW LEVEL SECURITY;

-- Tenant vê e gerencia apenas seus próprios registros
CREATE POLICY "outbox_tenant_all" ON public.message_outbox
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

-- Service role tem bypass total (worker process-followups usa service_role)
CREATE POLICY "outbox_service_all" ON public.message_outbox
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

;

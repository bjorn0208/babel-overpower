
-- =============================================================
-- Migration 12: Adicionar 'pending' ao CHECK de status das subscriptions
-- 'pending' = cliente criado pelo admin mas ainda não ativado
-- =============================================================

-- Remover constraint antigo
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;

-- Recriar com 'pending' incluído
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'pending'));

;

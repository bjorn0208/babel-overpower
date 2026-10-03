
-- =============================================================
-- Migration 13: Expandir valores de status das subscriptions
-- Frontend usa: active, pending, inactive, cancelled, expired
-- Stripe usa: active, canceled, past_due, trialing
-- Suportamos TODOS para compatibilidade
-- =============================================================

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN (
    'active',      -- ativo (frontend + stripe)
    'pending',     -- pendente (admin criou, não ativou)
    'inactive',    -- inativo (admin desativou manualmente)
    'cancelled',   -- cancelado pelo admin (frontend spelling)
    'canceled',    -- cancelado (stripe spelling)
    'expired',     -- expirado (período acabou)
    'past_due',    -- pagamento atrasado (stripe)
    'trialing'     -- período trial (stripe)
  ));

;

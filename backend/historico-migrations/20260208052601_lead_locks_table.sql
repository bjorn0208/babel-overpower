
-- ============================================================
-- Lock por lead via tabela (funciona entre transações separadas)
-- ============================================================

-- Tabela de locks por lead (usando a chave natural agent+channel+external_id)
CREATE TABLE IF NOT EXISTS lead_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  external_channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  CONSTRAINT lead_locks_unique UNIQUE (agent_id, external_channel, external_id)
);

CREATE INDEX idx_lead_locks_expires ON lead_locks(expires_at);

-- Função: tenta adquirir lock (retorna true se conseguiu)
-- Se lock expirado, sobrescreve. Se lock ativo, retorna false.
CREATE OR REPLACE FUNCTION try_acquire_lead_lock(
  _agent_id UUID,
  _external_channel TEXT,
  _external_id TEXT,
  _ttl_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  _inserted BOOLEAN := false;
BEGIN
  -- Limpar locks expirados deste lead
  DELETE FROM lead_locks
  WHERE agent_id = _agent_id
    AND external_channel = _external_channel
    AND external_id = _external_id
    AND expires_at < now();

  -- Tentar inserir lock
  BEGIN
    INSERT INTO lead_locks (agent_id, external_channel, external_id, expires_at)
    VALUES (_agent_id, _external_channel, _external_id, now() + (_ttl_seconds || ' seconds')::interval);
    _inserted := true;
  EXCEPTION WHEN unique_violation THEN
    _inserted := false;
  END;

  RETURN _inserted;
END;
$$;

-- Função: liberar lock
CREATE OR REPLACE FUNCTION release_lead_lock(
  _agent_id UUID,
  _external_channel TEXT,
  _external_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM lead_locks
  WHERE agent_id = _agent_id
    AND external_channel = _external_channel
    AND external_id = _external_id;
END;
$$;

-- Job para limpar locks expirados (a cada 5 minutos)
SELECT cron.schedule(
  'cleanup-expired-lead-locks',
  '*/5 * * * *',
  $$DELETE FROM lead_locks WHERE expires_at < now()$$
);

;

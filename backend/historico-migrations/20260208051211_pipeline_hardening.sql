
-- ============================================================
-- MIGRATION: Pipeline Hardening para Escala
-- ============================================================

-- 1. UNIQUE constraint para impedir leads duplicados
ALTER TABLE leads 
ADD CONSTRAINT leads_unique_agent_channel_external 
UNIQUE (agent_id, external_channel, external_id);

-- 2. Instalar pg_net para chamadas HTTP assíncronas
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- 3. Instalar unaccent para busca sem acentos
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;

-- 4. Advisory lock por lead (serializa msgs do mesmo lead)
CREATE OR REPLACE FUNCTION acquire_lead_lock(_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_try_advisory_xact_lock(
    ('x' || left(replace(_lead_id::text, '-', ''), 16))::bit(64)::bigint
  );
END;
$$;

-- 5. Pipeline preflight: verifica agent + tenant + subscription + créditos em UMA query atômica
CREATE OR REPLACE FUNCTION pipeline_preflight(
  _agent_id UUID,
  _message TEXT
)
RETURNS TABLE(
  allowed BOOLEAN,
  error_code TEXT,
  error_message TEXT,
  p_tenant_id UUID,
  p_agent_name TEXT,
  p_system_prompt TEXT,
  p_personality TEXT,
  p_temperature NUMERIC,
  p_max_response_tokens INT,
  p_fallback_message TEXT,
  p_llm_model_id UUID,
  p_welcome_message TEXT,
  p_is_unlimited BOOLEAN,
  p_wallet_balance NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _agent RECORD;
  _tenant RECORD;
  _sub RECORD;
  _wallet RECORD;
  _unlimited BOOLEAN;
BEGIN
  -- Buscar agent
  SELECT * INTO _agent FROM agents WHERE id = _agent_id AND status = 'active';
  IF _agent IS NULL THEN
    allowed := false; error_code := 'agent_not_found';
    error_message := 'Agente nao encontrado ou inativo';
    RETURN NEXT; RETURN;
  END IF;

  -- Buscar tenant
  SELECT * INTO _tenant FROM tenants WHERE id = _agent.tenant_id;
  IF _tenant IS NULL OR _tenant.status != 'active' THEN
    allowed := false; error_code := 'tenant_inactive';
    error_message := 'Conta inativa';
    RETURN NEXT; RETURN;
  END IF;

  -- Buscar subscription
  SELECT * INTO _sub FROM subscriptions
  WHERE tenant_id = _agent.tenant_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF _sub IS NULL THEN
    allowed := false; error_code := 'no_subscription';
    error_message := 'Sem assinatura ativa';
    RETURN NEXT; RETURN;
  END IF;

  _unlimited := _sub.override_unlimited OR _sub.billing_type = 'unlimited';

  -- Verificar créditos (com lock se necessário)
  IF NOT _unlimited THEN
    SELECT * INTO _wallet FROM credit_wallets
    WHERE tenant_id = _agent.tenant_id FOR UPDATE;

    IF _wallet IS NULL OR _wallet.balance < 1 THEN
      allowed := false; error_code := 'insufficient_credits';
      error_message := 'Creditos insuficientes';
      RETURN NEXT; RETURN;
    END IF;

    -- Reservar 1 crédito preventivamente
    UPDATE credit_wallets
    SET balance = balance - 1, updated_at = now()
    WHERE id = _wallet.id;
  ELSE
    SELECT * INTO _wallet FROM credit_wallets
    WHERE tenant_id = _agent.tenant_id;
  END IF;

  -- Tudo OK
  allowed := true;
  error_code := NULL;
  error_message := NULL;
  p_tenant_id := _agent.tenant_id;
  p_agent_name := _agent.name;
  p_system_prompt := _agent.system_prompt;
  p_personality := _agent.personality;
  p_temperature := _agent.temperature;
  p_max_response_tokens := _agent.max_response_tokens;
  p_fallback_message := _agent.fallback_message;
  p_llm_model_id := _agent.llm_model_id;
  p_welcome_message := _agent.welcome_message;
  p_is_unlimited := _unlimited;
  p_wallet_balance := COALESCE(_wallet.balance, 0);
  RETURN NEXT;
END;
$$;

-- 6. Settle credits: ajusta crédito reservado com o consumo real
CREATE OR REPLACE FUNCTION settle_credits(
  _tenant_id UUID,
  _llm_model_id UUID,
  _tokens_input INT,
  _tokens_output INT,
  _message_id UUID DEFAULT NULL,
  _was_reserved BOOLEAN DEFAULT true,
  _refund_only BOOLEAN DEFAULT false
)
RETURNS TABLE(
  success BOOLEAN,
  credits_consumed NUMERIC,
  balance_remaining NUMERIC,
  cost_usd NUMERIC,
  error_message TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _wallet RECORD;
  _calc RECORD;
  _actual_credits NUMERIC;
  _adjustment NUMERIC;
  _new_balance NUMERIC;
  _unlimited BOOLEAN;
  _reserved NUMERIC := CASE WHEN _was_reserved THEN 1 ELSE 0 END;
BEGIN
  _unlimited := is_tenant_unlimited(_tenant_id);

  SELECT * INTO _wallet FROM credit_wallets
  WHERE tenant_id = _tenant_id FOR UPDATE;

  IF _wallet IS NULL THEN
    success := false; error_message := 'Carteira nao encontrada';
    RETURN NEXT; RETURN;
  END IF;

  -- Se é apenas refund (pipeline falhou antes do LLM)
  IF _refund_only THEN
    IF _was_reserved AND NOT _unlimited THEN
      UPDATE credit_wallets
      SET balance = balance + 1, updated_at = now()
      WHERE id = _wallet.id;
    END IF;
    success := true; credits_consumed := 0;
    balance_remaining := _wallet.balance + CASE WHEN _was_reserved AND NOT _unlimited THEN 1 ELSE 0 END;
    cost_usd := 0;
    RETURN NEXT; RETURN;
  END IF;

  -- Calcular créditos reais
  SELECT * INTO _calc FROM calculate_credits(_llm_model_id, _tokens_input, _tokens_output);

  IF _unlimited THEN
    -- Devolver o crédito reservado (se houver) e logar
    IF _was_reserved THEN
      UPDATE credit_wallets
      SET balance = balance + 1, updated_at = now()
      WHERE id = _wallet.id;
    END IF;

    INSERT INTO credit_transactions (
      tenant_id, wallet_id, type, amount, balance_after, description,
      reference_type, reference_id, llm_model_id, token_input, token_output, cost_usd
    ) VALUES (
      _tenant_id, _wallet.id, 'consumption', 0,
      _wallet.balance + CASE WHEN _was_reserved THEN 1 ELSE 0 END,
      'Uso ilimitado (nao debitado)',
      'message', _message_id, _llm_model_id, _tokens_input, _tokens_output, _calc.cost_usd_total
    );

    success := true; credits_consumed := 0;
    balance_remaining := _wallet.balance + CASE WHEN _was_reserved THEN 1 ELSE 0 END;
    cost_usd := _calc.cost_usd_total;
    RETURN NEXT; RETURN;
  END IF;

  -- Calcular ajuste: créditos reais - crédito reservado
  _actual_credits := _calc.credits_total;
  _adjustment := _actual_credits - _reserved;

  -- Se precisa debitar mais e não tem saldo
  IF _adjustment > 0 AND _wallet.balance < _adjustment THEN
    _adjustment := _wallet.balance;
    _actual_credits := _reserved + _adjustment;
  END IF;

  _new_balance := _wallet.balance - _adjustment;

  UPDATE credit_wallets
  SET balance = _new_balance,
      total_consumed = total_consumed + _actual_credits,
      updated_at = now()
  WHERE id = _wallet.id;

  INSERT INTO credit_transactions (
    tenant_id, wallet_id, type, amount, balance_after, description,
    reference_type, reference_id, llm_model_id, token_input, token_output, cost_usd
  ) VALUES (
    _tenant_id, _wallet.id, 'consumption', -_actual_credits, _new_balance,
    'LLM: ' || _tokens_input || ' in + ' || _tokens_output || ' out',
    'message', _message_id, _llm_model_id, _tokens_input, _tokens_output, _calc.cost_usd_total
  );

  success := true;
  credits_consumed := _actual_credits;
  balance_remaining := _new_balance;
  cost_usd := _calc.cost_usd_total;
  RETURN NEXT;
END;
$$;

-- 7. Tabela de fila de mensagens (webhook → processamento assíncrono)
CREATE TABLE IF NOT EXISTS message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id),
  phone TEXT NOT NULL,
  message_text TEXT NOT NULL,
  agent_id UUID NOT NULL,
  external_message_id TEXT,
  instance_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  process_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT message_queue_status_check CHECK (status IN ('pending', 'processing', 'done', 'failed', 'grouped'))
);

CREATE INDEX idx_mq_pending ON message_queue(process_after)
WHERE status = 'pending';

CREATE INDEX idx_mq_phone_pending ON message_queue(phone, channel_id, status)
WHERE status = 'pending';

-- 8. Função para agrupar mensagens do mesmo telefone
CREATE OR REPLACE FUNCTION dequeue_grouped_messages(
  _channel_id UUID,
  _phone TEXT
)
RETURNS TABLE(
  combined_message TEXT,
  message_ids UUID[]
)
LANGUAGE plpgsql AS $$
DECLARE
  _messages RECORD;
  _combined TEXT := '';
  _ids UUID[] := '{}';
BEGIN
  -- Pegar todas as mensagens pendentes deste phone+channel
  FOR _messages IN
    SELECT id, message_text
    FROM message_queue
    WHERE channel_id = _channel_id
      AND phone = _phone
      AND status = 'pending'
      AND process_after <= now()
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    IF _combined != '' THEN
      _combined := _combined || ' ';
    END IF;
    _combined := _combined || _messages.message_text;
    _ids := array_append(_ids, _messages.id);
  END LOOP;

  -- Marcar como processing
  UPDATE message_queue
  SET status = 'processing'
  WHERE id = ANY(_ids);

  combined_message := _combined;
  message_ids := _ids;
  RETURN NEXT;
END;
$$;

-- 9. Função para marcar mensagens processadas
CREATE OR REPLACE FUNCTION complete_queue_messages(
  _message_ids UUID[],
  _status TEXT DEFAULT 'done',
  _error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE message_queue
  SET status = _status,
      processed_at = CASE WHEN _status = 'done' THEN now() ELSE NULL END,
      error_log = _error,
      attempts = attempts + 1
  WHERE id = ANY(_message_ids);
END;
$$;

-- 10. Índices trigram para busca fuzzy na knowledge_items
CREATE INDEX IF NOT EXISTS idx_knowledge_question_trgm
ON knowledge_items USING gin (question gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_knowledge_answer_trgm
ON knowledge_items USING gin (answer gin_trgm_ops);

-- 11. Melhorar hybrid_knowledge_search com trigram + unaccent
CREATE OR REPLACE FUNCTION hybrid_knowledge_search(
  _agent_id UUID,
  _query TEXT,
  _limit INT DEFAULT 5,
  _category TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  category TEXT,
  question TEXT,
  answer TEXT,
  relevance REAL
)
LANGUAGE plpgsql AS $$
DECLARE
  _clean_query TEXT;
BEGIN
  -- Limpar query: remover acentos e normalizar
  _clean_query := extensions.unaccent(lower(trim(_query)));

  RETURN QUERY
  SELECT
    ki.id, ki.category, ki.question, ki.answer,
    (
      -- Full-text search score (peso 2.0)
      COALESCE(ts_rank(
        to_tsvector('portuguese', ki.question || ' ' || ki.answer),
        plainto_tsquery('portuguese', _query)
      ), 0) * 2.0

      -- Trigram similarity no question (peso 1.5)
      + GREATEST(
        similarity(extensions.unaccent(lower(ki.question)), _clean_query),
        0
      ) * 1.5

      -- Trigram similarity no answer (peso 0.8)
      + GREATEST(
        similarity(extensions.unaccent(lower(ki.answer)), _clean_query),
        0
      ) * 0.8

      -- Keywords match (peso 1.0)
      + CASE WHEN ki.keywords && string_to_array(_clean_query, ' ') THEN 1.0 ELSE 0.0 END

      -- Synonyms match (peso 0.5)
      + CASE WHEN ki.synonyms && string_to_array(_clean_query, ' ') THEN 0.5 ELSE 0.0 END

      -- Priority boost
      + ki.priority * 0.1
    )::REAL AS relevance
  FROM knowledge_items ki
  WHERE ki.agent_id = _agent_id
    AND ki.is_active = true
    AND (_category IS NULL OR ki.category = _category)
    AND (
      -- Full-text match
      to_tsvector('portuguese', ki.question || ' ' || ki.answer) @@ plainto_tsquery('portuguese', _query)
      -- Trigram match (threshold 0.15 para ser inclusivo)
      OR similarity(extensions.unaccent(lower(ki.question)), _clean_query) > 0.15
      OR similarity(extensions.unaccent(lower(ki.answer)), _clean_query) > 0.15
      -- Keywords/synonyms
      OR ki.keywords && string_to_array(_clean_query, ' ')
      OR ki.synonyms && string_to_array(_clean_query, ' ')
      -- Substring match
      OR extensions.unaccent(lower(ki.question)) LIKE '%' || _clean_query || '%'
      OR extensions.unaccent(lower(ki.answer)) LIKE '%' || _clean_query || '%'
    )
  ORDER BY relevance DESC
  LIMIT _limit;
END;
$$;

;

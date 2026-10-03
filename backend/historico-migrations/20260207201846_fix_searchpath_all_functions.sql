
-- SET search_path = public em TODAS as funcoes restantes
-- (nao-SECURITY-DEFINER, mas o Supabase advisor recomenda)

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION get_config(_key TEXT, _tenant_id UUID DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
  _value TEXT;
BEGIN
  IF _tenant_id IS NOT NULL THEN
    SELECT value INTO _value
    FROM public.tenant_configs
    WHERE tenant_id = _tenant_id AND key = _key;
    IF _value IS NOT NULL THEN
      RETURN _value;
    END IF;
  END IF;
  SELECT value INTO _value
  FROM public.platform_configs
  WHERE key = _key;
  RETURN _value;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_tenant_unlimited(_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT s.override_unlimited OR s.billing_type = 'unlimited'
     FROM public.subscriptions s
     WHERE s.tenant_id = _tenant_id
       AND s.status = 'active'
     ORDER BY s.created_at DESC
     LIMIT 1),
    false
  )
$$ LANGUAGE sql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION calculate_credits(
  _llm_model_id UUID,
  _tokens_input INTEGER,
  _tokens_output INTEGER
)
RETURNS TABLE (
  credits_input INTEGER,
  credits_output INTEGER,
  credits_total INTEGER,
  cost_usd_input DECIMAL(10,6),
  cost_usd_output DECIMAL(10,6),
  cost_usd_total DECIMAL(10,6)
) AS $$
DECLARE
  _model RECORD;
BEGIN
  SELECT * INTO _model FROM public.llm_models WHERE id = _llm_model_id;
  IF _model IS NULL THEN
    RAISE EXCEPTION 'Modelo LLM nao encontrado: %', _llm_model_id;
  END IF;
  credits_input := CEIL(_tokens_input::DECIMAL / 1000 * _model.credits_per_1k_input);
  credits_output := CEIL(_tokens_output::DECIMAL / 1000 * _model.credits_per_1k_output);
  credits_total := credits_input + credits_output;
  cost_usd_input := _tokens_input * _model.cost_per_input_token;
  cost_usd_output := _tokens_output * _model.cost_per_output_token;
  cost_usd_total := cost_usd_input + cost_usd_output;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION update_conversation_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations SET
    message_count = message_count + 1,
    unanswered_count = CASE WHEN NEW.is_unanswered THEN unanswered_count + 1 ELSE unanswered_count END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION hybrid_knowledge_search(
  _agent_id UUID, _query TEXT, _category TEXT DEFAULT NULL, _limit INTEGER DEFAULT 5
)
RETURNS TABLE (id UUID, category TEXT, question TEXT, answer TEXT, relevance REAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ki.id, ki.category, ki.question, ki.answer,
    (
      COALESCE(ts_rank(
        to_tsvector('portuguese', ki.question || ' ' || ki.answer),
        plainto_tsquery('portuguese', _query)
      ), 0) * 2.0
      + CASE WHEN ki.keywords && string_to_array(lower(_query), ' ') THEN 1.0 ELSE 0.0 END
      + CASE WHEN ki.synonyms && string_to_array(lower(_query), ' ') THEN 0.5 ELSE 0.0 END
      + ki.priority * 0.1
    )::REAL AS relevance
  FROM public.knowledge_items ki
  WHERE ki.agent_id = _agent_id
    AND ki.is_active = true
    AND (_category IS NULL OR ki.category = _category)
    AND (
      to_tsvector('portuguese', ki.question || ' ' || ki.answer) @@ plainto_tsquery('portuguese', _query)
      OR ki.keywords && string_to_array(lower(_query), ' ')
      OR ki.synonyms && string_to_array(lower(_query), ' ')
      OR ki.question ILIKE '%' || _query || '%'
      OR ki.answer ILIKE '%' || _query || '%'
    )
  ORDER BY relevance DESC
  LIMIT _limit;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION debit_credits(
  _tenant_id UUID, _llm_model_id UUID, _tokens_input INTEGER, _tokens_output INTEGER, _message_id UUID DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, credits_debited INTEGER, balance_remaining DECIMAL(12,2), cost_usd DECIMAL(10,6), error_message TEXT) AS $$
DECLARE
  _wallet RECORD;
  _calc RECORD;
  _is_unlimited BOOLEAN;
  _new_balance DECIMAL(12,2);
BEGIN
  _is_unlimited := is_tenant_unlimited(_tenant_id);
  SELECT * INTO _calc FROM calculate_credits(_llm_model_id, _tokens_input, _tokens_output);
  SELECT * INTO _wallet FROM public.credit_wallets WHERE tenant_id = _tenant_id FOR UPDATE;
  IF _wallet IS NULL THEN
    success := false; error_message := 'Carteira nao encontrada'; RETURN NEXT; RETURN;
  END IF;
  IF _is_unlimited THEN
    INSERT INTO public.credit_transactions (tenant_id, wallet_id, type, amount, balance_after, description, reference_type, reference_id, llm_model_id, token_input, token_output, cost_usd)
    VALUES (_tenant_id, _wallet.id, 'consumption', 0, _wallet.balance, 'Uso ilimitado (nao debitado)', 'message', _message_id, _llm_model_id, _tokens_input, _tokens_output, _calc.cost_usd_total);
    success := true; credits_debited := 0; balance_remaining := _wallet.balance; cost_usd := _calc.cost_usd_total; RETURN NEXT; RETURN;
  END IF;
  IF _wallet.balance < _calc.credits_total THEN
    success := false; credits_debited := 0; balance_remaining := _wallet.balance; cost_usd := _calc.cost_usd_total;
    error_message := 'Creditos insuficientes. Saldo: ' || _wallet.balance || ', necessario: ' || _calc.credits_total; RETURN NEXT; RETURN;
  END IF;
  _new_balance := _wallet.balance - _calc.credits_total;
  UPDATE public.credit_wallets SET balance = _new_balance, total_consumed = total_consumed + _calc.credits_total, updated_at = now() WHERE id = _wallet.id;
  INSERT INTO public.credit_transactions (tenant_id, wallet_id, type, amount, balance_after, description, reference_type, reference_id, llm_model_id, token_input, token_output, cost_usd)
  VALUES (_tenant_id, _wallet.id, 'consumption', -_calc.credits_total, _new_balance, 'Consumo LLM: ' || _tokens_input || ' input + ' || _tokens_output || ' output tokens', 'message', _message_id, _llm_model_id, _tokens_input, _tokens_output, _calc.cost_usd_total);
  success := true; credits_debited := _calc.credits_total; balance_remaining := _new_balance; cost_usd := _calc.cost_usd_total; RETURN NEXT;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION add_credits(
  _tenant_id UUID, _amount DECIMAL(12,2), _type TEXT DEFAULT 'adjustment', _description TEXT DEFAULT 'Ajuste manual', _admin_id UUID DEFAULT NULL
)
RETURNS DECIMAL(12,2) AS $$
DECLARE
  _wallet RECORD;
  _new_balance DECIMAL(12,2);
BEGIN
  SELECT * INTO _wallet FROM public.credit_wallets WHERE tenant_id = _tenant_id FOR UPDATE;
  _new_balance := _wallet.balance + _amount;
  UPDATE public.credit_wallets SET balance = _new_balance,
    total_purchased = CASE WHEN _type IN ('purchase', 'bonus') THEN total_purchased + _amount ELSE total_purchased END,
    total_bonus = CASE WHEN _type = 'bonus' THEN total_bonus + _amount ELSE total_bonus END,
    updated_at = now()
  WHERE id = _wallet.id;
  INSERT INTO public.credit_transactions (tenant_id, wallet_id, type, amount, balance_after, description, created_by)
  VALUES (_tenant_id, _wallet.id, _type, _amount, _new_balance, _description, _admin_id);
  RETURN _new_balance;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION check_security(_content TEXT, _direction TEXT DEFAULT 'input')
RETURNS TABLE (is_blocked BOOLEAN, pattern_id UUID, pattern_name TEXT, severity TEXT, action_on_match TEXT, response_message TEXT) AS $$
DECLARE
  _pattern RECORD;
  _keywords TEXT[];
  _keyword TEXT;
BEGIN
  FOR _pattern IN
    SELECT sp.* FROM public.security_patterns sp
    WHERE sp.is_active = true AND sp.direction IN (_direction, 'both')
    ORDER BY CASE sp.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END
  LOOP
    IF _pattern.detection_rules ? 'keywords' THEN
      _keywords := ARRAY(SELECT jsonb_array_elements_text(_pattern.detection_rules->'keywords'));
      FOREACH _keyword IN ARRAY _keywords LOOP
        IF lower(_content) LIKE '%' || lower(_keyword) || '%' THEN
          is_blocked := (_pattern.action_on_match = 'block'); pattern_id := _pattern.id; pattern_name := _pattern.name;
          severity := _pattern.severity; action_on_match := _pattern.action_on_match; response_message := _pattern.response_message;
          RETURN NEXT; RETURN;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  is_blocked := false; RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION cleanup_webhook_dedup()
RETURNS void AS $$
  DELETE FROM public.webhook_dedup WHERE received_at < now() - interval '1 hour';
$$ LANGUAGE sql SET search_path = public;

CREATE OR REPLACE FUNCTION acquire_conversation_lock(_conversation_id UUID, _locked_by TEXT DEFAULT 'edge_function')
RETURNS BOOLEAN AS $$
DECLARE
  _acquired BOOLEAN;
BEGIN
  DELETE FROM public.conversation_locks WHERE expires_at < now();
  INSERT INTO public.conversation_locks (conversation_id, locked_by)
  VALUES (_conversation_id, _locked_by)
  ON CONFLICT (conversation_id) DO NOTHING;
  GET DIAGNOSTICS _acquired = ROW_COUNT;
  RETURN _acquired > 0;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION release_conversation_lock(_conversation_id UUID)
RETURNS void AS $$
  DELETE FROM public.conversation_locks WHERE conversation_id = _conversation_id;
$$ LANGUAGE sql SET search_path = public;

CREATE OR REPLACE FUNCTION check_rate_limit(_lead_id UUID, _max_per_minute INTEGER DEFAULT 10)
RETURNS BOOLEAN AS $$
DECLARE
  _record RECORD;
  _tenant_id UUID;
BEGIN
  SELECT * INTO _record FROM public.rate_limits WHERE lead_id = _lead_id FOR UPDATE;
  IF _record IS NULL THEN
    SELECT tenant_id INTO _tenant_id FROM public.leads WHERE id = _lead_id;
    INSERT INTO public.rate_limits (tenant_id, lead_id) VALUES (_tenant_id, _lead_id);
    RETURN true;
  END IF;
  IF _record.window_start < now() - interval '1 minute' THEN
    UPDATE public.rate_limits SET window_start = now(), message_count = 1 WHERE lead_id = _lead_id;
    RETURN true;
  END IF;
  IF _record.message_count >= _max_per_minute THEN
    RETURN false;
  END IF;
  UPDATE public.rate_limits SET message_count = message_count + 1 WHERE lead_id = _lead_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SET search_path = public;

;

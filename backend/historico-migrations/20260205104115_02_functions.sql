-- ================================================================================
-- SAAS AGENT IA WHITE LABEL - FUNÇÕES SQL
-- ================================================================================

-- FUNÇÃO: is_admin()
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNÇÃO: hybrid_knowledge_search()
CREATE OR REPLACE FUNCTION hybrid_knowledge_search(
  p_agent_id UUID,
  p_store_id UUID DEFAULT NULL,
  p_message TEXT DEFAULT '',
  p_categories TEXT[] DEFAULT ARRAY['general'],
  p_limit INTEGER DEFAULT 5,
  p_min_similarity DECIMAL DEFAULT 0.15
)
RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  category TEXT,
  image_url TEXT,
  file_url TEXT,
  file_name TEXT,
  buttons JSONB,
  similarity DECIMAL
) AS $$
DECLARE
  v_search_text TEXT;
BEGIN
  v_search_text := LOWER(TRIM(p_message));

  RETURN QUERY
  SELECT
    ki.id,
    ki.question,
    ki.answer,
    ki.category,
    ki.image_url,
    ki.file_url,
    ki.file_name,
    ki.buttons,
    GREATEST(
      similarity(LOWER(ki.question), v_search_text),
      similarity(LOWER(ki.answer), v_search_text)
    ) AS similarity
  FROM knowledge_items ki
  WHERE ki.agent_id = p_agent_id
    AND ki.is_active = true
    AND (
      p_store_id IS NULL
      OR ki.store_id IS NULL
      OR ki.store_id = p_store_id
    )
    AND (
      ki.category = ANY(p_categories)
      OR ki.category = 'general'
      OR GREATEST(
        similarity(LOWER(ki.question), v_search_text),
        similarity(LOWER(ki.answer), v_search_text)
      ) >= p_min_similarity
    )
  ORDER BY
    CASE WHEN ki.category = ANY(p_categories) THEN 0 ELSE 1 END,
    GREATEST(
      similarity(LOWER(ki.question), v_search_text),
      similarity(LOWER(ki.answer), v_search_text)
    ) DESC,
    ki.priority DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNÇÃO: check_security_patterns()
CREATE OR REPLACE FUNCTION check_security_patterns(p_message TEXT)
RETURNS TABLE (
  pattern_id UUID,
  pattern_name TEXT,
  pattern_type TEXT,
  detection_method TEXT,
  similarity_score DECIMAL,
  is_blocked BOOLEAN,
  prepared_response TEXT,
  severity TEXT
) AS $$
DECLARE
  v_message_lower TEXT;
  v_pattern RECORD;
  v_similarity DECIMAL;
  v_keyword_match BOOLEAN;
  v_regex_match BOOLEAN;
BEGIN
  v_message_lower := LOWER(TRIM(p_message));

  FOR v_pattern IN
    SELECT * FROM security_patterns sp
    WHERE sp.is_active = true
    ORDER BY
      CASE sp.severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END
  LOOP
    v_keyword_match := false;
    v_regex_match := false;
    v_similarity := 0;

    IF v_pattern.pattern_keywords IS NOT NULL AND array_length(v_pattern.pattern_keywords, 1) > 0 THEN
      SELECT EXISTS (
        SELECT 1 FROM unnest(v_pattern.pattern_keywords) AS keyword
        WHERE v_message_lower LIKE '%' || LOWER(keyword) || '%'
      ) INTO v_keyword_match;

      IF v_keyword_match THEN
        pattern_id := v_pattern.id;
        pattern_name := v_pattern.pattern_name;
        pattern_type := v_pattern.pattern_type;
        detection_method := 'keywords';
        similarity_score := 1.0;
        is_blocked := v_pattern.should_block;
        prepared_response := COALESCE(v_pattern.prepared_response_informal, v_pattern.prepared_response);
        severity := v_pattern.severity;
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;

    IF v_pattern.pattern_regex IS NOT NULL AND v_pattern.pattern_regex != '' THEN
      BEGIN
        v_regex_match := v_message_lower ~ v_pattern.pattern_regex;
      EXCEPTION WHEN OTHERS THEN
        v_regex_match := false;
      END;

      IF v_regex_match THEN
        pattern_id := v_pattern.id;
        pattern_name := v_pattern.pattern_name;
        pattern_type := v_pattern.pattern_type;
        detection_method := 'regex';
        similarity_score := 1.0;
        is_blocked := v_pattern.should_block;
        prepared_response := COALESCE(v_pattern.prepared_response_informal, v_pattern.prepared_response);
        severity := v_pattern.severity;
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;

    v_similarity := similarity(v_message_lower, LOWER(v_pattern.pattern_text));

    IF v_similarity >= v_pattern.similarity_threshold THEN
      pattern_id := v_pattern.id;
      pattern_name := v_pattern.pattern_name;
      pattern_type := v_pattern.pattern_type;
      detection_method := 'similarity';
      similarity_score := v_similarity;
      is_blocked := v_pattern.should_block;
      prepared_response := COALESCE(v_pattern.prepared_response_informal, v_pattern.prepared_response);
      severity := v_pattern.severity;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNÇÃO: increment_security_pattern_counter()
CREATE OR REPLACE FUNCTION increment_security_pattern_counter(p_pattern_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE security_patterns
  SET times_triggered = times_triggered + 1,
      updated_at = NOW()
  WHERE id = p_pattern_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNÇÃO: calculate_groq_cost()
CREATE OR REPLACE FUNCTION calculate_groq_cost(
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER
) RETURNS TABLE(
  cost_input DECIMAL(12, 8),
  cost_output DECIMAL(12, 8),
  cost_total DECIMAL(12, 8)
) AS $$
DECLARE
  v_input_price DECIMAL := 0.59 / 1000000;
  v_output_price DECIMAL := 0.79 / 1000000;
BEGIN
  cost_input := p_prompt_tokens * v_input_price;
  cost_output := p_completion_tokens * v_output_price;
  cost_total := cost_input + cost_output;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- FUNÇÃO: log_token_usage()
CREATE OR REPLACE FUNCTION log_token_usage(
  p_agent_id UUID,
  p_user_id UUID,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_model VARCHAR DEFAULT 'llama-3.3-70b-versatile',
  p_agent_name VARCHAR DEFAULT NULL,
  p_client_name VARCHAR DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT 0,
  p_blocked_by_security BOOLEAN DEFAULT false,
  p_endpoint VARCHAR DEFAULT '/chat'
) RETURNS UUID AS $$
DECLARE
  v_cost_input DECIMAL(12, 8);
  v_cost_output DECIMAL(12, 8);
  v_cost_total DECIMAL(12, 8);
  v_total_tokens INTEGER;
  v_id UUID;
BEGIN
  v_cost_input := p_prompt_tokens * (0.59 / 1000000);
  v_cost_output := p_completion_tokens * (0.79 / 1000000);
  v_cost_total := v_cost_input + v_cost_output;
  v_total_tokens := p_prompt_tokens + p_completion_tokens;

  INSERT INTO api_usage (
    agent_id, user_id,
    prompt_tokens, completion_tokens, total_tokens,
    cost_input, cost_output, cost_total,
    model, agent_name, client_name,
    response_time_ms, blocked_by_security,
    endpoint, status
  ) VALUES (
    p_agent_id, p_user_id,
    p_prompt_tokens, p_completion_tokens, v_total_tokens,
    v_cost_input, v_cost_output, v_cost_total,
    p_model, p_agent_name, p_client_name,
    p_response_time_ms, p_blocked_by_security,
    p_endpoint,
    CASE WHEN p_blocked_by_security THEN 'blocked' ELSE 'success' END
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNÇÃO: get_usd_brl_rate()
CREATE OR REPLACE FUNCTION get_usd_brl_rate()
RETURNS NUMERIC AS $$
BEGIN
  RETURN COALESCE(
    (SELECT (value->>'rate')::NUMERIC FROM system_settings WHERE key = 'usd_brl_rate'),
    5.85
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNÇÃO: has_permission()
CREATE OR REPLACE FUNCTION has_permission(p_user_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'admin') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM tenant_permissions
    WHERE user_id = p_user_id
    AND permission_key = p_permission_key
    AND (permission_value->>'enabled')::boolean = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNÇÃO: check_quota()
CREATE OR REPLACE FUNCTION check_quota(p_user_id UUID, p_quota_type TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_limit INTEGER;
BEGIN
  SELECT
    CASE p_quota_type
      WHEN 'agents' THEN max_agents
      WHEN 'stores' THEN max_stores_per_agent
      WHEN 'knowledge_items' THEN max_knowledge_items
      WHEN 'custom_buttons' THEN max_custom_buttons
      WHEN 'tokens' THEN max_tokens_per_month
      ELSE 0
    END INTO v_limit
  FROM tenant_quotas
  WHERE user_id = p_user_id;

  IF v_limit IS NULL THEN
    v_limit := CASE p_quota_type
      WHEN 'agents' THEN 1
      WHEN 'stores' THEN 5
      WHEN 'knowledge_items' THEN 100
      WHEN 'custom_buttons' THEN 10
      WHEN 'tokens' THEN 1000000
      ELSE 0
    END;
  END IF;

  RETURN v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- VIEW: token_usage_stats
CREATE OR REPLACE VIEW token_usage_stats AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as total_requests,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(cost_total) as total_cost,
  AVG(total_tokens) as avg_tokens_per_request,
  AVG(response_time_ms) as avg_response_time,
  SUM(CASE WHEN blocked_by_security THEN 1 ELSE 0 END) as blocked_count
FROM api_usage
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- TRIGGER: update_updated_at()
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agents_updated_at ON agents;
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS stores_updated_at ON stores;
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS api_usage_updated_at ON api_usage;
CREATE TRIGGER api_usage_updated_at BEFORE UPDATE ON api_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- GRANTS
GRANT EXECUTE ON FUNCTION is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION hybrid_knowledge_search TO authenticated, anon;
GRANT EXECUTE ON FUNCTION check_security_patterns TO authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_security_pattern_counter TO authenticated, anon;
GRANT EXECUTE ON FUNCTION calculate_groq_cost TO authenticated;
GRANT EXECUTE ON FUNCTION log_token_usage TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_usd_brl_rate TO authenticated;
GRANT EXECUTE ON FUNCTION has_permission TO authenticated;
GRANT EXECUTE ON FUNCTION check_quota TO authenticated;
;

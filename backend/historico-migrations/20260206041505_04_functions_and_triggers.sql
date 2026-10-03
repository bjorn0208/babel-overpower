
-- ================================================================================
-- LIMPA NOME IA - FUNCOES E TRIGGERS
-- ================================================================================

-- is_admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- get_user_agent_id
CREATE OR REPLACE FUNCTION get_user_agent_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE agent_uuid UUID;
BEGIN
  SELECT id INTO agent_uuid FROM agents
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
  RETURN agent_uuid;
END;
$$;

-- hybrid_knowledge_search
CREATE OR REPLACE FUNCTION hybrid_knowledge_search(
  p_agent_id UUID,
  p_store_id UUID DEFAULT NULL,
  p_message TEXT DEFAULT '',
  p_categories TEXT[] DEFAULT ARRAY['general'],
  p_limit INTEGER DEFAULT 5,
  p_min_similarity NUMERIC DEFAULT 0.15
)
RETURNS TABLE(
  id UUID, question TEXT, answer TEXT, category TEXT,
  image_url TEXT, buttons JSONB, similarity NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ki.id, ki.question, ki.answer, ki.category,
    ki.image_url, ki.buttons,
    GREATEST(
      extensions.similarity(ki.question, p_message),
      extensions.similarity(ki.answer, p_message)
    ) AS similarity
  FROM knowledge_items ki
  WHERE ki.agent_id = p_agent_id
    AND ki.is_active = true
    AND (p_store_id IS NULL OR ki.store_id IS NULL OR ki.store_id = p_store_id)
    AND (
      ki.category = ANY(p_categories)
      OR ki.category = 'general'
      OR GREATEST(
        extensions.similarity(ki.question, p_message),
        extensions.similarity(ki.answer, p_message)
      ) >= p_min_similarity
    )
  ORDER BY
    ki.priority DESC,
    GREATEST(
      extensions.similarity(ki.question, p_message),
      extensions.similarity(ki.answer, p_message)
    ) DESC
  LIMIT p_limit;
END;
$$;

-- check_security_patterns
CREATE OR REPLACE FUNCTION check_security_patterns(p_message TEXT)
RETURNS TABLE(
  should_block BOOLEAN, pattern_id UUID, pattern_type TEXT,
  detection_method TEXT, similarity_score NUMERIC,
  prepared_response TEXT, prepared_response_informal TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.should_block,
    sp.id AS pattern_id,
    sp.pattern_type,
    CASE
      WHEN sp.pattern_keywords IS NOT NULL AND
           EXISTS (SELECT 1 FROM unnest(sp.pattern_keywords) k WHERE p_message ILIKE '%' || k || '%')
      THEN 'keywords'
      WHEN extensions.similarity(sp.pattern_text, p_message) >= sp.similarity_threshold
      THEN 'similarity'
      ELSE 'regex'
    END AS detection_method,
    extensions.similarity(sp.pattern_text, p_message) AS similarity_score,
    sp.prepared_response,
    sp.prepared_response_informal
  FROM security_patterns sp
  WHERE sp.is_active = true
    AND (
      (sp.pattern_keywords IS NOT NULL AND
       EXISTS (SELECT 1 FROM unnest(sp.pattern_keywords) k WHERE p_message ILIKE '%' || k || '%'))
      OR extensions.similarity(sp.pattern_text, p_message) >= sp.similarity_threshold
    )
  ORDER BY extensions.similarity(sp.pattern_text, p_message) DESC
  LIMIT 1;
END;
$$;

-- increment_security_pattern_counter
CREATE OR REPLACE FUNCTION increment_security_pattern_counter(p_pattern_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE security_patterns
  SET times_triggered = times_triggered + 1, updated_at = NOW()
  WHERE id = p_pattern_id;
END;
$$;

-- log_token_usage
CREATE OR REPLACE FUNCTION log_token_usage(
  p_agent_id UUID, p_user_id UUID,
  p_prompt_tokens INTEGER, p_completion_tokens INTEGER,
  p_model TEXT DEFAULT 'qwen/qwen-2.5-72b-instruct',
  p_response_time_ms INTEGER DEFAULT 0,
  p_blocked BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO api_usage (
    agent_id, user_id, prompt_tokens, completion_tokens,
    total_tokens, model, response_time_ms, blocked_by_security,
    endpoint, status
  ) VALUES (
    p_agent_id, p_user_id, p_prompt_tokens, p_completion_tokens,
    p_prompt_tokens + p_completion_tokens, p_model, p_response_time_ms,
    p_blocked, '/chat', CASE WHEN p_blocked THEN 'blocked' ELSE 'success' END
  );
END;
$$;

-- update_api_key_usage
CREATE OR REPLACE FUNCTION update_api_key_usage(p_key_id UUID, p_tokens_used INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE api_keys SET
    requests_today = requests_today + 1,
    total_requests = total_requests + 1,
    total_tokens = total_tokens + p_tokens_used,
    last_used_at = NOW()
  WHERE id = p_key_id;
END;
$$;

-- mark_api_key_rate_limited
CREATE OR REPLACE FUNCTION mark_api_key_rate_limited(p_key_id UUID, p_retry_after_seconds INTEGER DEFAULT 60)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE api_keys SET
    rate_limited_until = NOW() + (p_retry_after_seconds || ' seconds')::interval
  WHERE id = p_key_id;
END;
$$;

-- has_permission
CREATE OR REPLACE FUNCTION has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_admin() THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM tenant_permissions
    WHERE user_id = auth.uid()
      AND permission_key = p_permission
      AND (permission_value->>'enabled')::boolean = true
      AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$;

-- check_quota
CREATE OR REPLACE FUNCTION check_quota(p_resource TEXT, p_current_count INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_limit INTEGER;
BEGIN
  IF is_admin() THEN RETURN true; END IF;
  SELECT CASE p_resource
    WHEN 'agents' THEN max_agents
    WHEN 'stores' THEN max_stores_per_agent
    WHEN 'knowledge' THEN max_knowledge_items
    WHEN 'buttons' THEN max_custom_buttons
    WHEN 'tokens' THEN max_tokens_per_month
    ELSE 999999
  END INTO v_limit
  FROM tenant_quotas WHERE user_id = auth.uid();
  IF v_limit IS NULL THEN RETURN true; END IF;
  RETURN p_current_count < v_limit;
END;
$$;

-- update_updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply update_updated_at to all tables with updated_at
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles', 'agents', 'stores', 'knowledge_items',
    'security_patterns', 'api_keys', 'api_usage', 'subscriptions',
    'leads', 'clients', 'contracts', 'payments', 'tasks'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END;
$$;

-- View: token_usage_stats
CREATE OR REPLACE VIEW token_usage_stats AS
SELECT
  agent_id, user_id,
  DATE(created_at) as usage_date,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(cost_total) as total_cost,
  COUNT(*) as total_requests,
  AVG(response_time_ms) as avg_response_time
FROM api_usage
GROUP BY agent_id, user_id, DATE(created_at);

;

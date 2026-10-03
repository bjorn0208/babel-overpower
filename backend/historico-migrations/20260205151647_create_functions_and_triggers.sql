
-- ===============================================
-- MIGRATION: CREATE FUNCTIONS AND TRIGGERS
-- ===============================================

-- Função: is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users u
    JOIN profiles p ON p.id = u.id
    WHERE u.id = auth.uid()
    AND p.role = 'admin'
  );
END;
$$;

-- Função: get_user_agent_id
CREATE OR REPLACE FUNCTION public.get_user_agent_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT id FROM agents WHERE user_id = auth.uid() LIMIT 1);
END;
$$;

-- Função: handle_new_user (trigger para criar profile quando user é criado)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$;

-- Função: update_updated_at (trigger genérico)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Função: check_security_patterns (detecção de ameaças)
CREATE OR REPLACE FUNCTION public.check_security_patterns(
  p_message TEXT,
  p_min_similarity FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  pattern_id UUID,
  pattern_name TEXT,
  pattern_type TEXT,
  severity TEXT,
  detection_method TEXT,
  similarity_score FLOAT,
  prepared_response TEXT,
  prepared_response_informal TEXT,
  should_block BOOLEAN,
  should_transfer_human BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  lower_message TEXT := lower(p_message);
  pattern_record RECORD;
BEGIN
  FOR pattern_record IN 
    SELECT * FROM security_patterns sp WHERE sp.is_active = true ORDER BY 
      CASE sp.severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        ELSE 4 
      END
  LOOP
    -- 1. CHECAGEM POR REGEX
    IF pattern_record.pattern_regex IS NOT NULL AND pattern_record.pattern_regex != '' THEN
      IF lower_message ~ pattern_record.pattern_regex THEN
        RETURN QUERY SELECT 
          pattern_record.id,
          pattern_record.pattern_name,
          pattern_record.pattern_type,
          pattern_record.severity,
          'regex'::TEXT,
          1.0::FLOAT,
          pattern_record.prepared_response,
          pattern_record.prepared_response_informal,
          pattern_record.should_block,
          pattern_record.should_transfer_human;
        RETURN;
      END IF;
    END IF;
    
    -- 2. CHECAGEM POR KEYWORDS
    IF pattern_record.pattern_keywords IS NOT NULL AND array_length(pattern_record.pattern_keywords, 1) > 0 THEN
      IF EXISTS (
        SELECT 1 FROM unnest(pattern_record.pattern_keywords) kw 
        WHERE lower_message LIKE '%' || lower(kw) || '%'
      ) THEN
        RETURN QUERY SELECT 
          pattern_record.id,
          pattern_record.pattern_name,
          pattern_record.pattern_type,
          pattern_record.severity,
          'keyword'::TEXT,
          0.8::FLOAT,
          pattern_record.prepared_response,
          pattern_record.prepared_response_informal,
          pattern_record.should_block,
          pattern_record.should_transfer_human;
        RETURN;
      END IF;
    END IF;
  END LOOP;
  
  -- 3. CHECAGEM POR SIMILARIDADE
  RETURN QUERY
  SELECT 
    sp.id,
    sp.pattern_name,
    sp.pattern_type,
    sp.severity,
    'similarity'::TEXT as detection_method,
    similarity(sp.pattern_text, p_message)::FLOAT as sim_score,
    sp.prepared_response,
    sp.prepared_response_informal,
    sp.should_block,
    sp.should_transfer_human
  FROM security_patterns sp
  WHERE 
    sp.is_active = true
    AND sp.pattern_text IS NOT NULL
    AND sp.pattern_text != ''
    AND similarity(sp.pattern_text, p_message) >= COALESCE(sp.similarity_threshold, p_min_similarity)
  ORDER BY similarity(sp.pattern_text, p_message) DESC
  LIMIT 1;
END;
$$;

-- Função: hybrid_knowledge_search (busca híbrida)
CREATE OR REPLACE FUNCTION public.hybrid_knowledge_search(
  p_agent_id UUID,
  p_store_id UUID,
  p_message TEXT,
  p_categories TEXT[] DEFAULT NULL,
  p_min_similarity FLOAT DEFAULT 0.3,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  item_type TEXT,
  rule_text TEXT,
  image_url TEXT,
  file_url TEXT,
  file_name TEXT,
  buttons UUID[],
  category TEXT,
  similarity_score FLOAT,
  match_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH scored_items AS (
    SELECT 
      ki.id,
      ki.question,
      ki.answer,
      ki.item_type,
      ki.rule_text,
      ki.image_url,
      ki.file_url,
      ki.file_name,
      ki.attached_buttons as buttons,
      ki.category,
      GREATEST(
        COALESCE(similarity(ki.question, p_message), 0),
        COALESCE(similarity(ki.answer, p_message), 0) * 0.7
      )::FLOAT as sim_score,
      CASE 
        WHEN ki.category = ANY(p_categories) THEN 'category_match'
        ELSE 'similarity_only'
      END as m_type
    FROM knowledge_items ki
    WHERE 
      ki.is_active = true
      AND (
        ki.agent_id = p_agent_id 
        OR (ki.store_id = p_store_id AND p_store_id IS NOT NULL)
      )
      AND (
        p_categories IS NULL 
        OR ki.category = ANY(p_categories)
        OR similarity(ki.question, p_message) > p_min_similarity + 0.1
      )
  )
  SELECT 
    si.id,
    si.question,
    si.answer,
    si.item_type,
    si.rule_text,
    si.image_url,
    si.file_url,
    si.file_name,
    si.buttons,
    si.category,
    si.sim_score as similarity_score,
    si.m_type as match_type
  FROM scored_items si
  WHERE si.sim_score >= p_min_similarity
  ORDER BY 
    CASE WHEN si.m_type = 'category_match' THEN 0 ELSE 1 END,
    si.sim_score DESC
  LIMIT p_limit;
END;
$$;

-- Função: increment_analytics
CREATE OR REPLACE FUNCTION public.increment_analytics(p_agent_id UUID, p_date DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO analytics_daily (agent_id, date, conversations_count, messages_count)
  VALUES (p_agent_id, p_date, 0, 1)
  ON CONFLICT (agent_id, date) 
  DO UPDATE SET 
    messages_count = analytics_daily.messages_count + 1,
    updated_at = NOW();
END;
$$;

-- Função: increment_conversation_count
CREATE OR REPLACE FUNCTION public.increment_conversation_count(p_agent_id UUID, p_date DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO analytics_daily (agent_id, date, conversations_count, messages_count)
  VALUES (p_agent_id, p_date, 1, 0)
  ON CONFLICT (agent_id, date) 
  DO UPDATE SET 
    conversations_count = analytics_daily.conversations_count + 1,
    updated_at = NOW();
END;
$$;

-- Função: increment_security_pattern_counter
CREATE OR REPLACE FUNCTION public.increment_security_pattern_counter(p_pattern_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE security_patterns
  SET 
    times_triggered = times_triggered + 1,
    last_triggered_at = now(),
    updated_at = now()
  WHERE id = p_pattern_id;
END;
$$;

-- Função: get_available_api_key
CREATE OR REPLACE FUNCTION public.get_available_api_key()
RETURNS TABLE (
  id UUID,
  key_value TEXT,
  name VARCHAR,
  priority INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ak.id,
    ak.key_value,
    ak.name,
    ak.priority
  FROM api_keys ak
  WHERE ak.is_active = true
    AND (ak.rate_limited_until IS NULL OR ak.rate_limited_until < NOW())
  ORDER BY ak.priority ASC, ak.requests_today ASC
  LIMIT 1;
END;
$$;

-- Função: update_api_key_usage
CREATE OR REPLACE FUNCTION public.update_api_key_usage(p_key_id UUID, p_tokens_used INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE api_keys
  SET 
    requests_today = requests_today + 1,
    total_requests = total_requests + 1,
    total_tokens = total_tokens + p_tokens_used,
    last_used_at = NOW(),
    last_error = NULL,
    updated_at = NOW()
  WHERE id = p_key_id;
END;
$$;

-- Função: mark_api_key_rate_limited
CREATE OR REPLACE FUNCTION public.mark_api_key_rate_limited(p_key_id UUID, p_retry_after_seconds INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE api_keys
  SET 
    rate_limited_until = NOW() + (p_retry_after_seconds || ' seconds')::INTERVAL,
    last_error = 'Rate limited at ' || NOW()::TEXT,
    updated_at = NOW()
  WHERE id = p_key_id;
END;
$$;

-- Função: reset_daily_api_counters
CREATE OR REPLACE FUNCTION public.reset_daily_api_counters()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE api_keys
  SET 
    requests_today = 0,
    rate_limited_until = NULL
  WHERE requests_today > 0 OR rate_limited_until IS NOT NULL;
END;
$$;

-- Função: check_quota
CREATE OR REPLACE FUNCTION public.check_quota(p_user_id UUID, p_quota_type TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
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
$$;

-- Função: has_permission
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
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
$$;

-- Função: get_usd_brl_rate
CREATE OR REPLACE FUNCTION public.get_usd_brl_rate()
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT (value->>'rate')::NUMERIC FROM system_settings WHERE key = 'usd_brl_rate'),
    5.85
  );
END;
$$;

-- Função: generate_public_slug (trigger)
CREATE OR REPLACE FUNCTION public.generate_public_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  IF NEW.public_slug IS NULL OR NEW.public_slug = '' THEN
    base_slug := lower(regexp_replace(COALESCE(NEW.business_name, 'agent'), '[^a-z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    final_slug := base_slug;
    
    WHILE EXISTS (SELECT 1 FROM agents WHERE public_slug = final_slug AND id != NEW.id) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;
    
    NEW.public_slug := final_slug;
  END IF;
  RETURN NEW;
END;
$$;

-- Função: on_new_conversation (trigger)
CREATE OR REPLACE FUNCTION public.on_new_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM increment_conversation_count(NEW.agent_id, CURRENT_DATE);
  RETURN NEW;
END;
$$;

-- ==================== TRIGGERS ====================

-- Trigger para criar profile quando user é criado
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Triggers de updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_knowledge_items_updated_at BEFORE UPDATE ON knowledge_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_quick_actions_updated_at BEFORE UPDATE ON quick_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_custom_buttons_updated_at BEFORE UPDATE ON custom_buttons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_analytics_updated_at BEFORE UPDATE ON analytics_daily FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_security_patterns_updated_at BEFORE UPDATE ON security_patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_api_usage_updated_at BEFORE UPDATE ON api_usage FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger para gerar slug
CREATE TRIGGER generate_agent_slug BEFORE INSERT OR UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION generate_public_slug();

-- Trigger para incrementar contador de conversas
CREATE TRIGGER on_conversation_created AFTER INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION on_new_conversation();

;

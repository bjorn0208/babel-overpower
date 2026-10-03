
-- 1. Add is_template column to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

-- 2. Mark Roberta as template
UPDATE agents SET is_template = true WHERE slug = 'roberta-limpa-nome';

-- 3. Function to clone an agent (with knowledge, instructions, flows, blocks) to a target tenant
CREATE OR REPLACE FUNCTION clone_agent_to_tenant(
  _source_agent_id UUID,
  _target_tenant_id UUID,
  _created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _src RECORD;
  _new_agent_id UUID;
  _new_slug TEXT;
  _flow_rec RECORD;
  _new_flow_id UUID;
  _flow_map JSONB := '{}'::JSONB;
  _block_rec RECORD;
BEGIN
  -- Fetch source agent
  SELECT * INTO _src FROM agents WHERE id = _source_agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent % not found', _source_agent_id;
  END IF;

  -- Generate unique slug
  _new_slug := _src.slug || '-' || LEFT(gen_random_uuid()::TEXT, 8);

  -- Clone agent
  INSERT INTO agents (tenant_id, name, slug, description, llm_model_id, system_prompt, personality,
    temperature, max_response_tokens, status, welcome_message, fallback_message, is_published,
    created_by, metadata, is_template)
  VALUES (_target_tenant_id, _src.name, _new_slug, _src.description, _src.llm_model_id,
    _src.system_prompt, _src.personality, _src.temperature, _src.max_response_tokens,
    _src.status, _src.welcome_message, _src.fallback_message, _src.is_published,
    _created_by, _src.metadata, false)
  RETURNING id INTO _new_agent_id;

  -- Clone knowledge_items
  INSERT INTO knowledge_items (tenant_id, agent_id, category, question, answer, keywords, synonyms, priority, is_active, created_by)
  SELECT _target_tenant_id, _new_agent_id, category, question, answer, keywords, synonyms, priority, is_active, _created_by
  FROM knowledge_items WHERE agent_id = _source_agent_id;

  -- Clone agent_instructions
  INSERT INTO agent_instructions (tenant_id, agent_id, category, title, content, injection_mode, trigger_keywords, priority, is_active)
  SELECT _target_tenant_id, _new_agent_id, category, title, content, injection_mode, trigger_keywords, priority, is_active
  FROM agent_instructions WHERE agent_id = _source_agent_id;

  -- Clone flows (with ID mapping)
  FOR _flow_rec IN SELECT * FROM flows WHERE agent_id = _source_agent_id ORDER BY position LOOP
    INSERT INTO flows (agent_id, tenant_id, name, description, position, is_entry_point, status, knowledge_categories)
    VALUES (_new_agent_id, _target_tenant_id, _flow_rec.name, _flow_rec.description, _flow_rec.position,
      _flow_rec.is_entry_point, _flow_rec.status, _flow_rec.knowledge_categories)
    RETURNING id INTO _new_flow_id;

    _flow_map := _flow_map || jsonb_build_object(_flow_rec.id::TEXT, _new_flow_id::TEXT);
  END LOOP;

  -- Clone blocks using flow mapping
  FOR _block_rec IN
    SELECT b.* FROM blocks b
    JOIN flows f ON f.id = b.flow_id
    WHERE f.agent_id = _source_agent_id
    ORDER BY b.flow_id, b.position
  LOOP
    INSERT INTO blocks (flow_id, tenant_id, block_type_definition_id, position, label, config, is_active)
    VALUES (
      (_flow_map ->> _block_rec.flow_id::TEXT)::UUID,
      _target_tenant_id,
      _block_rec.block_type_definition_id,
      _block_rec.position,
      _block_rec.label,
      _block_rec.config,
      _block_rec.is_active
    );
  END LOOP;

  RETURN _new_agent_id;
END;
$$;

;

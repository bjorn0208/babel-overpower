
-- ============================================================
-- 015 KNOWLEDGE_ITEMS
-- ============================================================

CREATE TABLE knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  category TEXT NOT NULL DEFAULT 'general',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  synonyms TEXT[] DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_tenant ON knowledge_items (tenant_id);
CREATE INDEX idx_knowledge_agent ON knowledge_items (agent_id);
CREATE INDEX idx_knowledge_category ON knowledge_items (category);
CREATE INDEX idx_knowledge_active ON knowledge_items (is_active) WHERE is_active = true;

CREATE INDEX idx_knowledge_fts ON knowledge_items
  USING GIN (to_tsvector('portuguese', question || ' ' || answer));

CREATE INDEX idx_knowledge_keywords ON knowledge_items USING GIN (keywords);
CREATE INDEX idx_knowledge_synonyms ON knowledge_items USING GIN (synonyms);

CREATE TRIGGER trg_knowledge_updated_at
  BEFORE UPDATE ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_select"
  ON knowledge_items FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "knowledge_insert"
  ON knowledge_items FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND has_permission('knowledge.edit')
  );

CREATE POLICY "knowledge_update"
  ON knowledge_items FOR UPDATE
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('knowledge.edit'))
    OR is_platform_admin()
  );

CREATE POLICY "knowledge_delete"
  ON knowledge_items FOR DELETE
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('knowledge.edit'))
    OR is_platform_admin()
  );

-- FUNCAO: Busca hibrida
CREATE OR REPLACE FUNCTION hybrid_knowledge_search(
  _agent_id UUID,
  _query TEXT,
  _category TEXT DEFAULT NULL,
  _limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  question TEXT,
  answer TEXT,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ki.id,
    ki.category,
    ki.question,
    ki.answer,
    (
      COALESCE(ts_rank(
        to_tsvector('portuguese', ki.question || ' ' || ki.answer),
        plainto_tsquery('portuguese', _query)
      ), 0) * 2.0
      + CASE WHEN ki.keywords && string_to_array(lower(_query), ' ') THEN 1.0 ELSE 0.0 END
      + CASE WHEN ki.synonyms && string_to_array(lower(_query), ' ') THEN 0.5 ELSE 0.0 END
      + ki.priority * 0.1
    )::REAL AS relevance
  FROM knowledge_items ki
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
$$ LANGUAGE plpgsql STABLE;

;


CREATE OR REPLACE FUNCTION get_active_instructions(
  _agent_id UUID,
  _message TEXT,
  _flow_categories TEXT[] DEFAULT '{}'
)
RETURNS TABLE(category TEXT, title TEXT, content TEXT, injection_mode TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _msg_lower TEXT := lower(extensions.unaccent(_message));
BEGIN
  RETURN QUERY
  SELECT 
    ai.category,
    ai.title,
    ai.content,
    ai.injection_mode
  FROM agent_instructions ai
  WHERE ai.agent_id = _agent_id
    AND ai.is_active = true
    AND (
      ai.injection_mode = 'always'
      OR (
        ai.injection_mode = 'on_demand'
        AND EXISTS (
          SELECT 1 FROM unnest(ai.trigger_keywords) kw
          WHERE _msg_lower LIKE '%' || lower(kw) || '%'
        )
      )
      OR (
        ai.injection_mode = 'flow'
        AND ai.category = ANY(_flow_categories)
      )
    )
  ORDER BY ai.priority ASC;
END;
$$;

;

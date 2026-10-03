
-- Corrigir hybrid_knowledge_search: prefixar similarity com extensions.
CREATE OR REPLACE FUNCTION public.hybrid_knowledge_search(
  _agent_id uuid, 
  _query text, 
  _limit integer DEFAULT 5, 
  _category text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, category text, question text, answer text, relevance real)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _clean_query TEXT;
BEGIN
  _clean_query := extensions.unaccent(lower(trim(_query)));

  RETURN QUERY
  SELECT
    ki.id, ki.category, ki.question, ki.answer,
    (
      COALESCE(ts_rank(
        to_tsvector('portuguese', ki.question || ' ' || ki.answer),
        plainto_tsquery('portuguese', _query)
      ), 0) * 2.0

      + GREATEST(
        extensions.similarity(extensions.unaccent(lower(ki.question)), _clean_query),
        0
      ) * 1.5

      + GREATEST(
        extensions.similarity(extensions.unaccent(lower(ki.answer)), _clean_query),
        0
      ) * 0.8

      + CASE WHEN ki.keywords && string_to_array(_clean_query, ' ') THEN 1.0 ELSE 0.0 END
      + CASE WHEN ki.synonyms && string_to_array(_clean_query, ' ') THEN 0.5 ELSE 0.0 END
      + ki.priority * 0.1
    )::REAL AS relevance
  FROM knowledge_items ki
  WHERE ki.agent_id = _agent_id
    AND ki.is_active = true
    AND (_category IS NULL OR ki.category = _category)
    AND (
      to_tsvector('portuguese', ki.question || ' ' || ki.answer) @@ plainto_tsquery('portuguese', _query)
      OR extensions.similarity(extensions.unaccent(lower(ki.question)), _clean_query) > 0.15
      OR extensions.similarity(extensions.unaccent(lower(ki.answer)), _clean_query) > 0.15
      OR ki.keywords && string_to_array(_clean_query, ' ')
      OR ki.synonyms && string_to_array(_clean_query, ' ')
      OR extensions.unaccent(lower(ki.question)) LIKE '%' || _clean_query || '%'
      OR extensions.unaccent(lower(ki.answer)) LIKE '%' || _clean_query || '%'
    )
  ORDER BY relevance DESC
  LIMIT _limit;
END;
$function$;

;


-- Fix 9 RPCs com agent_id em SELECT/WHERE → agente_id

CREATE OR REPLACE FUNCTION public.admin_excluir_usuarios(p_user_ids uuid[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_caller_role text; v_uid uuid; v_deleted int := 0;
BEGIN
  SELECT system_role INTO v_caller_role FROM public.profiles WHERE id = (SELECT auth.uid()) LIMIT 1;
  IF v_caller_role IS DISTINCT FROM 'platform_admin' THEN RAISE EXCEPTION 'Apenas administradores podem deletar usuarios'; END IF;
  IF (SELECT auth.uid()) = ANY(p_user_ids) THEN RAISE EXCEPTION 'Voce nao pode deletar sua propria conta'; END IF;
  DELETE FROM public.blocos_conhecimento WHERE agente_id IN (SELECT id FROM public.agentes_usuario WHERE user_id = ANY(p_user_ids));
  DELETE FROM public.leads WHERE id IN (SELECT l.id FROM public.leads l JOIN public.conversas c ON c.lead_id = l.id WHERE c.tenant_id = ANY(p_user_ids));
  DELETE FROM public.conversas WHERE tenant_id = ANY(p_user_ids);
  FOREACH v_uid IN ARRAY p_user_ids LOOP DELETE FROM auth.users WHERE id = v_uid; v_deleted := v_deleted + 1; END LOOP;
  RETURN jsonb_build_object('deleted', v_deleted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.busca_hibrida(query_text text, query_embedding text, p_agent_id uuid, match_count integer DEFAULT 5, full_text_weight double precision DEFAULT 1.2, semantic_weight double precision DEFAULT 0.8, rrf_k integer DEFAULT 50, blocked_tags text[] DEFAULT '{}'::text[])
 RETURNS TABLE(id uuid, title text, content text, category text, tags text[], score double precision)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
BEGIN
  RETURN QUERY
  WITH fts_results AS (
    SELECT kc.id, kc.title, kc.content, kc.category, kc.tags,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kc.fts, websearch_to_tsquery('portuguese', query_text)) DESC) AS rank
    FROM blocos_conhecimento kc
    WHERE kc.agente_id = p_agent_id AND kc.fts @@ websearch_to_tsquery('portuguese', query_text) AND NOT (kc.tags && blocked_tags)
    LIMIT match_count * 2
  ),
  vector_results AS (
    SELECT kc.id, kc.title, kc.content, kc.category, kc.tags,
           ROW_NUMBER() OVER (ORDER BY kc.vetor_semantico <=> query_embedding::extensions.vector ASC) AS rank
    FROM blocos_conhecimento kc
    WHERE kc.agente_id = p_agent_id AND kc.vetor_semantico IS NOT NULL AND NOT (kc.tags && blocked_tags)
    LIMIT match_count * 2
  ),
  rrf AS (
    SELECT COALESCE(f.id, v.id) AS id, COALESCE(f.title, v.title) AS title, COALESCE(f.content, v.content) AS content,
           COALESCE(f.category, v.category) AS category, COALESCE(f.tags, v.tags) AS tags,
           COALESCE(full_text_weight / (rrf_k + f.rank), 0.0) + COALESCE(semantic_weight / (rrf_k + v.rank), 0.0) AS score
    FROM fts_results f FULL OUTER JOIN vector_results v ON f.id = v.id
  )
  SELECT rrf.id, rrf.title, rrf.content, rrf.category, rrf.tags, rrf.score FROM rrf ORDER BY rrf.score DESC LIMIT match_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.busca_hibrida_conhecimento(p_query_text text, p_query_embedding halfvec, p_agent_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_tipo text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_match_count integer DEFAULT 20, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50, p_tom text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, agent_id uuid, escopo text, title text, content text, category text, tipo text, tags text[], rrf_score double precision)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
  WITH base AS (
    SELECT kc.* FROM public.blocos_conhecimento kc
    WHERE kc.ativo = true
      AND (kc.escopo = 'global'
        OR (kc.escopo = 'nicho'  AND p_nicho_id IS NOT NULL AND kc.nicho_id  = p_nicho_id)
        OR (kc.escopo = 'tenant' AND p_agent_id IS NOT NULL AND kc.agente_id = p_agent_id))
      AND (p_tipo     IS NULL OR kc.tipo     = p_tipo)
      AND (p_category IS NULL OR kc.category = p_category)
      AND (p_tom IS NULL OR kc.tags IS NULL OR NOT (kc.tags && ARRAY['formal','informal']::text[]) OR p_tom = ANY(kc.tags))
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(b.fts, websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b WHERE p_query_text IS NOT NULL AND p_query_text <> '' AND b.fts @@ websearch_to_tsquery('portuguese', p_query_text) LIMIT 60
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b WHERE b.vetor_semantico IS NOT NULL ORDER BY b.vetor_semantico <=> p_query_embedding LIMIT 60
  )
  SELECT b.id, b.agente_id AS agent_id, b.escopo, b.title, b.content, b.category, b.tipo, b.tags,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_semantic_weight  * 1.0 / (p_rrf_k + s.rnk),  0.0)) AS rrf_score
  FROM base b LEFT JOIN full_text ft ON ft.id = b.id LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL ORDER BY rrf_score DESC LIMIT p_match_count;
$function$;

CREATE OR REPLACE FUNCTION public.busca_hibrida_fase_requisitos(p_query_text text, p_query_embedding halfvec, p_fase text, p_agent_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_produto_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 10, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, descricao_curta text, descricao_semantica text, obrigatorio boolean, evidencias jsonb, escopo text, ordem integer, rrf_score double precision)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
  WITH base AS (
    SELECT fr.* FROM public.fase_requisitos fr
    WHERE fr.ativo = true AND fr.fase = p_fase
      AND (fr.escopo = 'global'
        OR (fr.escopo = 'nicho'    AND p_nicho_id   IS NOT NULL AND fr.nicho_id   = p_nicho_id)
        OR (fr.escopo = 'tenant'   AND p_tenant_id  IS NOT NULL AND fr.tenant_id  = p_tenant_id)
        OR (fr.escopo = 'produto'  AND p_produto_id IS NOT NULL AND fr.produto_id = p_produto_id)
        OR (fr.escopo = 'agente'   AND p_agent_id   IS NOT NULL AND fr.agente_id  = p_agent_id))
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(to_tsvector('portuguese', coalesce(b.descricao_curta, '') || ' ' || coalesce(b.descricao_semantica, '')),
                         websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.descricao_curta, '') || ' ' || coalesce(b.descricao_semantica, '')) @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 30
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b WHERE b.vetor_semantico IS NOT NULL ORDER BY b.vetor_semantico <=> p_query_embedding LIMIT 30
  )
  SELECT b.id, b.descricao_curta, b.descricao_semantica, b.obrigatorio, b.evidencias, b.escopo, b.ordem,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b LEFT JOIN full_text ft ON ft.id = b.id LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL ORDER BY rrf_score DESC LIMIT p_match_count;
$function$;

CREATE OR REPLACE FUNCTION public.busca_vetorial(query_embedding vector, p_agent_id uuid, match_count integer DEFAULT 8, similarity_threshold double precision DEFAULT 0.45, p_exclude_categories text[] DEFAULT ARRAY['fluxo'::text])
 RETURNS TABLE(id uuid, title text, content text, category text, tags text[], similarity double precision)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  RETURN QUERY
  SELECT kc.id, kc.title, kc.content, kc.category, kc.tags, 1 - (kc.vetor_semantico <=> query_embedding) AS similarity
  FROM public.blocos_conhecimento kc
  WHERE kc.agente_id = p_agent_id AND kc.vetor_semantico IS NOT NULL
    AND (p_exclude_categories IS NULL OR kc.category IS NULL OR kc.category <> ALL(p_exclude_categories))
    AND 1 - (kc.vetor_semantico <=> query_embedding) >= similarity_threshold
  ORDER BY kc.vetor_semantico <=> query_embedding LIMIT match_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.definir_buffer_compondo(p_phone text, p_agent_id uuid, p_composing boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF p_composing THEN
    UPDATE public.buffer_mensagens SET is_composing = true WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false;
  ELSE
    UPDATE public.buffer_mensagens SET is_composing = false, last_activity_at = now() WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false;
  END IF;
  RETURN jsonb_build_object('updated', FOUND);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reivindicar_buffer_mensagem(p_phone text, p_agent_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_buffer record;
BEGIN
  UPDATE public.buffer_mensagens SET processed = true WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false RETURNING * INTO v_buffer;
  IF v_buffer IS NULL THEN RETURN jsonb_build_object('mensagens', '[]'::jsonb, 'count', 0); END IF;
  RETURN jsonb_build_object('mensagens', v_buffer.mensagens, 'count', jsonb_array_length(v_buffer.mensagens),
    'first_at', v_buffer.first_at, 'last_at', v_buffer.last_activity_at, 'channel_id', v_buffer.channel_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_blocos_fts(p_agent_id uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  UPDATE blocos_conhecimento SET fts = to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(content, '')) WHERE agente_id = p_agent_id;
$function$;

CREATE OR REPLACE FUNCTION public.verificar_buffer_pronto(p_phone text, p_agent_id uuid, p_threshold_seconds integer DEFAULT 7)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_buf record;
BEGIN
  SELECT * INTO v_buf FROM public.buffer_mensagens WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false;
  IF v_buf IS NULL THEN RETURN jsonb_build_object('ready', false, 'exists', false); END IF;
  RETURN jsonb_build_object('ready', (NOT v_buf.is_composing AND (now() - v_buf.last_activity_at) >= make_interval(secs => p_threshold_seconds)),
    'exists', true, 'is_composing', v_buf.is_composing,
    'age_ms', EXTRACT(EPOCH FROM (now() - v_buf.last_activity_at)) * 1000, 'count', jsonb_array_length(v_buf.mensagens));
END;
$function$;

;

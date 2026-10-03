-- Aplica override por tenant nas 8 RPCs de busca das gavetas de CONTEÚDO.
-- Regra (Theus 2026-06-03): override só tem efeito em bloco escopo='nicho';
-- bloco 'global' é FIXO (nunca desliga, mesmo com override). Tenant 'próprio' não usa override.
-- Predicado inserido no filtro de cada CTE base, sem tocar ranking/FTS/semantic/prompt.

-- 1) COMPORTAMENTO (substitui o NOT EXISTS antigo, que desligava qualquer escopo)
CREATE OR REPLACE FUNCTION public.busca_hibrida_comportamento(p_query_text text, p_query_embedding halfvec, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_produto_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 20, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50, p_tom text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, escopo text, situacao_descricao text, instrucao text, prioridade integer, tags text[], rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT bc.*
    FROM public.blocos_comportamento bc
    WHERE bc.ativo = true
      AND (
        bc.escopo = 'global'
        OR (bc.escopo = 'nicho'   AND p_nicho_id   IS NOT NULL AND bc.nicho_id   = p_nicho_id)
        OR (bc.escopo = 'tenant'  AND p_tenant_id  IS NOT NULL AND bc.tenant_id  = p_tenant_id)
        OR (bc.escopo = 'produto' AND p_tenant_id  IS NOT NULL AND p_produto_id IS NOT NULL
            AND bc.tenant_id = p_tenant_id AND bc.produto_id = p_produto_id)
      )
      AND NOT (
        bc.escopo = 'nicho'
        AND p_tenant_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.overrides_tenant_blocos_comportamento ov
          WHERE ov.bloco_id = bc.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false
        )
      )
      AND (
        p_tom IS NULL
        OR bc.tags IS NULL
        OR NOT (bc.tags && ARRAY['formal','informal']::text[])
        OR p_tom = ANY(bc.tags)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(b.situacao_descricao,'') || ' ' || coalesce(b.instrucao,'')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.situacao_descricao,'') || ' ' || coalesce(b.instrucao,''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 60
  )
  SELECT b.id, b.escopo, b.situacao_descricao, b.instrucao, b.prioridade, b.tags,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight  * 1.0 / (p_rrf_k + s.rnk),  0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic  s  ON s.id  = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST
  LIMIT p_match_count;
$function$;

-- 2) HUMANIZACAO
CREATE OR REPLACE FUNCTION public.busca_hibrida_humanizacao(p_query_text text, p_query_embedding halfvec, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_persona_tags text[] DEFAULT NULL::text[], p_match_count integer DEFAULT 10, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, categoria text, subcategoria text, regra text, exemplos_bons text[], exemplos_ruins text[], contexto_uso text, quando_nao_usar text, tags_persona text[], escopo text, prioridade integer, rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT hc.* FROM public.blocos_humanizacao hc WHERE hc.ativo = true
      AND (hc.escopo='global'
        OR (hc.escopo='nicho' AND p_nicho_id IS NOT NULL AND hc.nicho_id=p_nicho_id)
        OR (hc.escopo='tenant' AND p_tenant_id IS NOT NULL AND hc.tenant_id=p_tenant_id))
      AND NOT (
        hc.escopo='nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_humanizacao ov
                    WHERE ov.bloco_id=hc.id AND ov.tenant_id=p_tenant_id AND ov.ativo=false)
      )
      AND (p_persona_tags IS NULL OR array_length(p_persona_tags,1) IS NULL OR hc.tags_persona && p_persona_tags)
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(
      to_tsvector('portuguese', coalesce(b.regra,'')||' '||coalesce(b.contexto_uso,'')),
      websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.regra,'')||' '||coalesce(b.contexto_uso,''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 40
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding LIMIT 40
  )
  SELECT b.id, b.categoria, b.subcategoria, b.regra, b.exemplos_bons, b.exemplos_ruins,
    b.contexto_uso, b.quando_nao_usar, b.tags_persona, b.escopo, b.prioridade,
    (coalesce(p_full_text_weight*1.0/(p_rrf_k+ft.rnk),0.0)+coalesce(p_semantic_weight*1.0/(p_rrf_k+s.rnk),0.0)) AS rrf_score
  FROM base b LEFT JOIN full_text ft ON ft.id=b.id LEFT JOIN semantic s ON s.id=b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST LIMIT p_match_count;
$function$;

-- 3) GATILHO
CREATE OR REPLACE FUNCTION public.busca_hibrida_gatilho(p_query_text text, p_query_embedding halfvec, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 5, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, nome_trigger text, exemplo_frase text, acao_disparada text, acao_payload jsonb, escopo text, rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT tc.* FROM public.blocos_gatilho tc WHERE tc.ativo = true
      AND (tc.escopo='global'
        OR (tc.escopo='nicho' AND p_nicho_id IS NOT NULL AND tc.nicho_id=p_nicho_id)
        OR (tc.escopo='tenant' AND p_tenant_id IS NOT NULL AND tc.tenant_id=p_tenant_id))
      AND NOT (
        tc.escopo='nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_gatilho ov
                    WHERE ov.bloco_id=tc.id AND ov.tenant_id=p_tenant_id AND ov.ativo=false)
      )
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(
      to_tsvector('portuguese', coalesce(b.nome_trigger,'')||' '||coalesce(b.exemplo_frase,'')),
      websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.nome_trigger,'')||' '||coalesce(b.exemplo_frase,''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 30
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding LIMIT 30
  )
  SELECT b.id, b.nome_trigger, b.exemplo_frase, b.acao_disparada, b.acao_payload, b.escopo,
    (coalesce(p_full_text_weight*1.0/(p_rrf_k+ft.rnk),0.0)+coalesce(p_semantic_weight*1.0/(p_rrf_k+s.rnk),0.0)) AS rrf_score
  FROM base b LEFT JOIN full_text ft ON ft.id=b.id LEFT JOIN semantic s ON s.id=b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC LIMIT p_match_count;
$function$;

-- 4) VARIACAO
CREATE OR REPLACE FUNCTION public.busca_hibrida_variacao(p_query_text text, p_query_embedding halfvec, p_agent_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 10, p_rrf_k integer DEFAULT 50, p_categoria text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, nome_variation text, instrucao text, categoria text, subcategoria text, escopo text, prioridade integer, rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT vc.*
    FROM public.blocos_variacao vc
    WHERE vc.ativo = true
      AND (
        vc.escopo = 'global'
        OR (vc.escopo = 'nicho'  AND p_nicho_id  IS NOT NULL AND vc.nicho_id  = p_nicho_id)
        OR (vc.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND vc.tenant_id = p_tenant_id)
      )
      AND NOT (
        vc.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_variacao ov
                    WHERE ov.bloco_id=vc.id AND ov.tenant_id=p_tenant_id AND ov.ativo=false)
      )
      AND (p_categoria IS NULL OR vc.categoria = p_categoria)
      AND (p_tags      IS NULL OR array_length(p_tags, 1) IS NULL OR vc.subcategoria = ANY(p_tags))
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(b.nome_variation, '') || ' ' || coalesce(b.instrucao, '')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.nome_variation, '') || ' ' || coalesce(b.instrucao, ''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 40
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 40
  )
  SELECT
    b.id, b.nome_variation, b.instrucao, b.categoria, b.subcategoria, b.escopo, b.prioridade,
    (coalesce(1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic  s  ON s.id  = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST
  LIMIT p_match_count;
$function$;

-- 5) PROCEDURAIS (plpgsql)
CREATE OR REPLACE FUNCTION public.busca_hibrida_procedurais(p_query_text text, p_query_embedding halfvec, p_tenant_id uuid, p_nicho_id uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.4, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0)
 RETURNS TABLE(id uuid, nome text, passos jsonb, escopo text, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT pc.id, pc.nome_procedimento, pc.passos, pc.escopo, pc.vetor_semantico
    FROM public.blocos_procedurais pc
    WHERE pc.ativo = true
      AND pc.deleted_at IS NULL
      AND (
        pc.escopo = 'global'
        OR (pc.escopo = 'nicho'  AND pc.nicho_id  = p_nicho_id)
        OR (pc.escopo = 'tenant' AND pc.tenant_id = p_tenant_id)
      )
      AND NOT (
        pc.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_procedurais ov
                    WHERE ov.bloco_id = pc.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', b.nome_procedimento), websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', b.nome_procedimento) @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 60
  ),
  fused AS (
    SELECT b.id, b.nome_procedimento, b.passos, b.escopo,
           (coalesce(p_fts_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_sem_weight * 1.0 / (p_rrf_k + s.rnk), 0.0))::double precision AS rrf_score
    FROM base b
    LEFT JOIN full_text ft ON ft.id = b.id
    LEFT JOIN semantic   s  ON s.id  = b.id
    WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  )
  SELECT f.id, f.nome_procedimento AS nome, f.passos, f.escopo, f.rrf_score
  FROM fused f
  WHERE f.rrf_score >= p_threshold::double precision
  ORDER BY f.rrf_score DESC
  LIMIT p_top_k;
END;
$function$;

-- 6) EMOCAO (plpgsql, search_path '' -> tudo qualificado public.) — override nos dois CTEs
CREATE OR REPLACE FUNCTION public.busca_hibrida_emocao(p_query_text text, p_query_embedding halfvec, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_top_k integer DEFAULT 3, p_threshold numeric DEFAULT 0.35, p_intensidade_min numeric DEFAULT 0.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, emocao text, corpo text, intensidade_match numeric, escopo text, prioridade integer, score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH semantica AS (
    SELECT
      e.id, e.emocao, e.corpo, e.intensidade_match, e.escopo, e.prioridade,
      (1 - (e.vetor_semantico <=> p_query_embedding)::numeric) AS sim,
      ROW_NUMBER() OVER (ORDER BY (e.vetor_semantico <=> p_query_embedding) ASC) AS rank_sem
    FROM public.emocao_blocos e
    WHERE e.ativo = true
      AND e.embedding_status = 'pronto'
      AND e.intensidade_match >= p_intensidade_min
      AND (
        e.escopo = 'global'
        OR (e.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND e.nicho_id = p_nicho_id)
        OR (e.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND e.tenant_id = p_tenant_id)
      )
      AND NOT (
        e.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_emocao ov
                    WHERE ov.bloco_id = e.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false)
      )
    ORDER BY e.vetor_semantico <=> p_query_embedding
    LIMIT 50
  ),
  lexica AS (
    SELECT
      e.id,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', coalesce(e.corpo,'') || ' ' || coalesce(e.emocao,'')),
                                              plainto_tsquery('portuguese', p_query_text)) DESC) AS rank_lex
    FROM public.emocao_blocos e
    WHERE e.ativo = true
      AND to_tsvector('portuguese', coalesce(e.corpo,'') || ' ' || coalesce(e.emocao,'')) @@ plainto_tsquery('portuguese', p_query_text)
      AND (
        e.escopo = 'global'
        OR (e.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND e.nicho_id = p_nicho_id)
        OR (e.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND e.tenant_id = p_tenant_id)
      )
      AND NOT (
        e.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_emocao ov
                    WHERE ov.bloco_id = e.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false)
      )
    LIMIT 50
  )
  SELECT
    s.id, s.emocao, s.corpo, s.intensidade_match, s.escopo, s.prioridade,
    (1.0/(p_rrf_k + s.rank_sem) + COALESCE(1.0/(p_rrf_k + l.rank_lex), 0.0))::numeric AS score
  FROM semantica s
  LEFT JOIN lexica l ON l.id = s.id
  WHERE s.sim >= p_threshold
  ORDER BY score DESC
  LIMIT p_top_k;
END;
$function$;

-- 7) PROVA_SOCIAL (plpgsql)
CREATE OR REPLACE FUNCTION public.busca_hibrida_prova_social(p_query_text text, p_query_embedding halfvec, p_tenant_id uuid, p_nicho_id uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.4, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0)
 RETURNS TABLE(id uuid, depoimento text, autor text, idade integer, escopo text, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT ps.id, ps.depoimento, ps.autor, ps.idade, ps.escopo, ps.vetor_semantico
    FROM public.prova_social_blocos ps
    WHERE ps.ativo = true
      AND (
        ps.escopo = 'global'
        OR (ps.escopo = 'nicho'  AND ps.nicho_id  = p_nicho_id)
        OR (ps.escopo = 'tenant' AND ps.tenant_id = p_tenant_id)
      )
      AND NOT (
        ps.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_prova_social ov
                    WHERE ov.bloco_id = ps.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', b.depoimento || ' ' || b.autor), websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', b.depoimento || ' ' || b.autor) @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 60
  ),
  fused AS (
    SELECT b.id, b.depoimento, b.autor, b.idade, b.escopo,
           (coalesce(p_fts_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_sem_weight * 1.0 / (p_rrf_k + s.rnk), 0.0))::double precision AS rrf_score
    FROM base b
    LEFT JOIN full_text ft ON ft.id = b.id
    LEFT JOIN semantic   s  ON s.id  = b.id
    WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  )
  SELECT f.id, f.depoimento, f.autor, f.idade, f.escopo, f.rrf_score
  FROM fused f
  WHERE f.rrf_score >= p_threshold::double precision
  ORDER BY f.rrf_score DESC
  LIMIT p_top_k;
END;
$function$;

-- 8) ANTI_PADROES (plpgsql)
CREATE OR REPLACE FUNCTION public.busca_hibrida_anti_padroes(p_query_text text, p_query_embedding halfvec, p_tenant_id uuid, p_nicho_id uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.4, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0, p_tipo_campanha text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, situacao text, acao_correta text, por_que text, escopo text, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT ap.id, ap.situacao, ap.acao_correta, ap.por_que, ap.escopo, ap.vetor_semantico
    FROM public.anti_padroes ap
    WHERE ap.ativo = true
      AND (ap.real_world_valid_to IS NULL OR ap.real_world_valid_to > now())
      AND (p_tipo_campanha IS NULL OR ap.tipo_campanha = p_tipo_campanha)
      AND (
        ap.escopo = 'global'
        OR (ap.escopo = 'nicho'  AND ap.nicho_id  = p_nicho_id)
        OR (ap.escopo = 'tenant' AND ap.tenant_id = p_tenant_id)
      )
      AND NOT (
        ap.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_anti_padroes ov
                    WHERE ov.bloco_id = ap.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', b.situacao || ' ' || b.acao_correta), websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', b.situacao || ' ' || b.acao_correta) @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 60
  ),
  fused AS (
    SELECT b.id, b.situacao, b.acao_correta, b.por_que, b.escopo,
           (coalesce(p_fts_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_sem_weight * 1.0 / (p_rrf_k + s.rnk), 0.0))::double precision AS rrf_score
    FROM base b
    LEFT JOIN full_text ft ON ft.id = b.id
    LEFT JOIN semantic   s  ON s.id  = b.id
    WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  )
  SELECT f.id, f.situacao, f.acao_correta, f.por_que, f.escopo, f.rrf_score
  FROM fused f
  WHERE f.rrf_score >= p_threshold::double precision
  ORDER BY f.rrf_score DESC
  LIMIT p_top_k;
END;
$function$;
;

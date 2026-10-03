-- Fix: 3 RPCs quebradas pelo rename bitemporal pt-BR da memoria_lead (2026-07-13).
-- real_world_valid_from → valido_desde · system_expired_at → sistema_expirou_em.
-- Down: reverter trocando valido_desde/sistema_expirou_em pelos nomes EN antigos (colunas não existem mais — down só faz sentido junto do rename reverso da tabela).

CREATE OR REPLACE FUNCTION public.fn_dossie_lead_consolidado(p_lead_id uuid, p_conversa_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE resultado jsonb;
DECLARE conv_efetiva uuid;
BEGIN
  conv_efetiva := COALESCE(
    p_conversa_id,
    (SELECT id FROM public.conversas
      WHERE lead_id = p_lead_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1)
  );

  SELECT jsonb_build_object(
    'lead', (
      SELECT jsonb_build_object(
        'id', l.id, 'nome_exibicao', l.nome_exibicao, 'name', l.name,
        'phone', l.phone, 'email', l.email,
        'tags', COALESCE(l.tags, ARRAY[]::text[]),
        'dados_ficha', COALESCE(l.dados_ficha, '{}'::jsonb),
        'fase_pipeline', l.fase_pipeline, 'temperatura_lead', l.temperatura_lead,
        'criado_em', l.created_at,
        'divida_total', l.divida_total, 'produto', l.produto,
        'fase_cliente', l.fase_cliente, 'client_checkpoints', l.client_checkpoints,
        'tarefas_cliente', l.tarefas_cliente, 'perfil_estilo', l.perfil_estilo,
        'custom_fields', l.custom_fields, 'origem_lead', l.origem_lead,
        'pontuacao', l.pontuacao, 'converted_at', l.converted_at,
        'url_foto_perfil', l.url_foto_perfil, 'location', l.location,
        'first_contact_at', (SELECT MIN(created_at) FROM public.mensagens m WHERE m.conversation_id IN (SELECT id FROM public.conversas WHERE lead_id = p_lead_id))
      )
      FROM public.leads l WHERE l.id = p_lead_id
    ),
    'fatos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'fato', fato, 'categoria', categoria, 'relevancia', relevancia,
        'confianca', confianca, 'valido_desde', valido_desde,
        'criado_em', criado_em, 'escopo', escopo
      ) ORDER BY CASE relevancia WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END * confianca DESC, criado_em DESC)
      FROM public.memoria_lead WHERE lead_id = p_lead_id AND ativa = true LIMIT 10
    ), '[]'::jsonb),
    'episodios', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'episodio_resumo', episodio_resumo, 'gancho', gancho,
        'emocao', emocao, 'outcome', outcome, 'decay_factor', decay_factor,
        'relevancia', relevancia, 'turno_inicio', turno_inicio, 'turno_fim', turno_fim,
        'criado_em', criado_em
      ) ORDER BY criado_em DESC)
      FROM public.memoria_episodica WHERE lead_id = p_lead_id AND ativa = true AND decay_factor > 0.1 LIMIT 10
    ), '[]'::jsonb),
    'compromissos_ativos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ca.id, 'tipo', ca.tipo, 'origem', ca.origem, 'origem_tabela', ca.origem_tabela,
        'titulo', ca.titulo, 'executar_em', ca.executar_em, 'status', ca.status,
        'conversa_id', ca.conversa_id
      ) ORDER BY ca.executar_em ASC)
      FROM public.compromissos_ativos ca
      WHERE ca.conversa_id IN (SELECT id FROM public.conversas WHERE lead_id = p_lead_id)
    ), '[]'::jsonb),
    'contratos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'titulo', titulo, 'chave_publica', chave_publica, 'status', status,
        'assinado_em', assinado_em, 'criado_em', created_at,
        'metodo_pagamento', metodo_pagamento, 'opcoes_pagamento', opcoes_pagamento,
        'url_comprovante_pagamento', url_comprovante_pagamento
      ) ORDER BY created_at DESC)
      FROM public.contratos WHERE lead_id = p_lead_id
    ), '[]'::jsonb),
    'campanhas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', lc.id, 'campanha_id', lc.campaign_id, 'campanha_nome', c.name,
        'fase_atual', lc.phase, 'status', lc.state, 'criado_em', lc.entered_at
      ) ORDER BY lc.entered_at DESC)
      FROM public.leads_campanha lc
      JOIN public.campanhas c ON c.id = lc.campaign_id
      WHERE lc.lead_id = p_lead_id AND lc.archived_at IS NULL
    ), '[]'::jsonb),
    'anexos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'role', m.role, 'tipo', m.carga->>'media_type',
        'media_url', m.carga->>'media_url', 'categoria_anexo', m.categoria_anexo,
        'content', m.content, 'criado_em', m.created_at
      ) ORDER BY m.created_at DESC)
      FROM public.mensagens m
      WHERE m.conversation_id IN (SELECT id FROM public.conversas WHERE lead_id = p_lead_id)
        AND m.categoria_anexo IS NOT NULL AND m.deleted_at IS NULL
      LIMIT 30
    ), '[]'::jsonb),
    'crenca_conversa', (
      SELECT jsonb_build_object(
        'belief', belief, 'resumo_agente', resumo_agente, 'proxima_intencao', proxima_intencao,
        'proximo_passo_previsto', proximo_passo_previsto, 'estilo_lead', estilo_lead,
        'updated_at', updated_at
      )
      FROM public.crenca_conversa
      WHERE conversation_id = conv_efetiva
      ORDER BY updated_at DESC NULLS LAST LIMIT 1
    ),
    'pensamento_atual', (
      SELECT dados FROM public.intencoes_pendentes
      WHERE conversa_id = conv_efetiva
      ORDER BY criado_em DESC LIMIT 1
    ),
    'cargo_ativo', (
      SELECT jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'tipologia', c.tipologia,
        'objetivo_principal', c.objetivo_principal, 'regras_livres', c.regras_livres,
        'campos_rastreio', c.campos_rastreio
      )
      FROM public.cargos c
      WHERE c.id = (SELECT cargo_ativo_id FROM public.conversas WHERE id = conv_efetiva)
    ),
    'engajamento', (
      SELECT jsonb_build_object(
        'nivel', nivel, 'pontuacao', pontuacao, 'velocidade_media_s', velocidade_media_s,
        'comprimento_medio', comprimento_medio, 'conversas_count', conversas_count,
        'tendencia', tendencia, 'ultima_atualizacao', ultima_atualizacao
      )
      FROM public.engajamento_lead WHERE lead_id = p_lead_id LIMIT 1
    ),
    'conversa_ativa_id', conv_efetiva,
    'gerado_em', now()
  ) INTO resultado;

  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buscar_leads_por_descricao(p_tenant_id uuid, p_query_embedding halfvec, p_match_count integer DEFAULT 100, p_min_similarity numeric DEFAULT 0.6)
 RETURNS TABLE(lead_id uuid, similarity numeric, num_fatos integer, fatos_resumo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF p_query_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH centroides AS (
    SELECT
      lm.lead_id AS lid,
      AVG(lm.vetor_semantico) AS centroide,
      count(*)::int AS num_fatos,
      string_agg(lm.fato, ' · ' ORDER BY lm.criado_em DESC) AS fatos_resumo
    FROM public.memoria_lead lm
    WHERE lm.tenant_id = p_tenant_id
      AND lm.ativa = true
      AND lm.sistema_expirou_em IS NULL
      AND lm.vetor_semantico IS NOT NULL
    GROUP BY lm.lead_id
    HAVING count(*) > 0
  )
  SELECT
    c.lid,
    (1 - (c.centroide <=> p_query_embedding))::numeric,
    c.num_fatos,
    LEFT(c.fatos_resumo, 500)
  FROM centroides c
  WHERE (1 - (c.centroide <=> p_query_embedding)) >= p_min_similarity
  ORDER BY c.centroide <=> p_query_embedding ASC
  LIMIT p_match_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buscar_leads_similares(p_tenant_id uuid, p_lead_id_referencia uuid, p_match_count integer DEFAULT 10, p_min_similarity numeric DEFAULT 0.65)
 RETURNS TABLE(lead_id uuid, similarity numeric, num_fatos integer, fatos_resumo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_centroide_ref extensions.halfvec(1536);
  v_num_fatos_ref int;
BEGIN
  SELECT
    AVG(lm.vetor_semantico),
    count(*)
  INTO v_centroide_ref, v_num_fatos_ref
  FROM public.memoria_lead lm
  WHERE lm.tenant_id = p_tenant_id
    AND lm.lead_id = p_lead_id_referencia
    AND lm.ativa = true
    AND lm.sistema_expirou_em IS NULL
    AND lm.vetor_semantico IS NOT NULL;

  IF v_centroide_ref IS NULL OR v_num_fatos_ref = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH centroides AS (
    SELECT
      lm.lead_id AS lid,
      AVG(lm.vetor_semantico) AS centroide,
      count(*)::int AS num_fatos,
      string_agg(lm.fato, ' · ' ORDER BY lm.criado_em DESC) AS fatos_resumo
    FROM public.memoria_lead lm
    WHERE lm.tenant_id = p_tenant_id
      AND lm.lead_id <> p_lead_id_referencia
      AND lm.ativa = true
      AND lm.sistema_expirou_em IS NULL
      AND lm.vetor_semantico IS NOT NULL
    GROUP BY lm.lead_id
    HAVING count(*) > 0
  )
  SELECT
    c.lid,
    (1 - (c.centroide <=> v_centroide_ref))::numeric,
    c.num_fatos,
    LEFT(c.fatos_resumo, 500)
  FROM centroides c
  WHERE (1 - (c.centroide <=> v_centroide_ref)) >= p_min_similarity
  ORDER BY c.centroide <=> v_centroide_ref ASC
  LIMIT p_match_count;
END;
$function$;
;

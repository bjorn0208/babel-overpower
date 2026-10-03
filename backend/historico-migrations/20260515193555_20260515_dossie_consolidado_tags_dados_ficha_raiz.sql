CREATE OR REPLACE FUNCTION public.fn_dossie_lead_consolidado(
  p_lead_id uuid,
  p_conversa_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
        'first_contact_at', (SELECT MIN(created_at) FROM public.mensagens m WHERE m.conversation_id IN (SELECT id FROM public.conversas WHERE lead_id = p_lead_id))
      )
      FROM public.leads l WHERE l.id = p_lead_id
    ),
    'fatos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'fato', fato, 'categoria', categoria, 'relevancia', relevancia,
        'confianca', confianca, 'real_world_valid_from', real_world_valid_from,
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
    'tags', COALESCE(
      (SELECT to_jsonb(tags) FROM public.leads WHERE id = p_lead_id),
      '[]'::jsonb
    ),
    'dados_ficha', COALESCE(
      (SELECT dados_ficha FROM public.leads WHERE id = p_lead_id),
      '{}'::jsonb
    ),
    'conversa_ativa_id', conv_efetiva,
    'gerado_em', now()
  ) INTO resultado;

  RETURN resultado;
END;
$$;
;

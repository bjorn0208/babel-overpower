-- Ativa o sistema novo de fluxo/fase semantico oficialmente para o nicho limpa_nome.
-- Clona os 9 fase_requisitos do escopo "agente" do Lucas Ferraz para o escopo "nicho",
-- generaliza descricoes (tira "Lucas Ferraz", "K4 Bank", valores R$ especificos) e
-- baixa threshold de 0.5 para 0.25 (rerank Cohere v3.5 entrega 0.22-0.30 em pt-BR coloquial).
-- Em seguida, desativa os 9 originais do escopo "agente" para nao duplicar (preserva historico).

DO $$
DECLARE
  v_nicho_id uuid := '92a87163-7f2c-405f-9532-45f8e0b97220'; -- limpa_nome
  v_agent_lucas uuid := 'c332a69b-7542-4f8b-bd6f-5bb3c4fe084c';
  v_threshold double precision := 0.25;
BEGIN
  -- 1/9 saudacao/1 — Cumprimentou e se apresentou
  INSERT INTO public.fase_requisitos
    (fase, ordem, descricao_curta, descricao_semantica, obrigatorio, evidencias,
     escopo, nicho_id, threshold, combinacao_evidencias, ativo, embedding_status)
  VALUES (
    'saudacao', 1,
    'Cumprimentou e se apresentou',
    'Agente cumprimentou o lead com saudacao por horario (bom dia/boa tarde/boa noite) e se apresentou pelo nome e empresa antes de fazer a primeira pergunta.',
    true,
    '[{"alvo":"cumprimentou","tipo":"flag"},{"role":"assistant","tipo":"sinal_semantico","min_score":0.3,"janela_turnos":3}]'::jsonb,
    'nicho', v_nicho_id, v_threshold, 'max', true, 'pending'
  );

  -- 2/9 qualificacao/1 — Lead confirmou estar negativado
  INSERT INTO public.fase_requisitos
    (fase, ordem, descricao_curta, descricao_semantica, obrigatorio, evidencias,
     escopo, nicho_id, threshold, combinacao_evidencias, ativo, embedding_status)
  VALUES (
    'qualificacao', 1,
    'Lead confirmou estar negativado',
    'Lead confirma que tem o nome negativado, sujo, com restricao no Serasa, SPC, Boa Vista ou Cenprot, ou esta com dificuldade para conseguir credito.',
    true,
    '[{"role":"user","tipo":"sinal_semantico","min_score":0.3,"janela_turnos":3},{"tipo":"aceite","min_score":0.3,"janela_turnos":2,"pergunta_esperada":"Voce esta com o nome negativado, no Serasa, SPC ou Boa Vista?"},{"role":"user","tipo":"heuristica_pt_br","flags":"i","regex":"\\b(t[ôo]\\s+(negativ|sujo|com\\s+nome\\s+sujo|no\\s+serasa|no\\s+spc|com\\s+restri[çc][ãa]o)|negativad|inadimplent|nome\\s+sujo|nome\\s+no\\s+serasa)","janela_turnos":3,"score_quando_bate":0.85}]'::jsonb,
    'nicho', v_nicho_id, v_threshold, 'max', true, 'pending'
  );

  -- 3/9 qualificacao/2 — Capturar o nome do lead
  INSERT INTO public.fase_requisitos
    (fase, ordem, descricao_curta, descricao_semantica, obrigatorio, evidencias,
     escopo, nicho_id, threshold, combinacao_evidencias, ativo, embedding_status)
  VALUES (
    'qualificacao', 2,
    'Capturar o nome do lead',
    'Agente capturou o nome do lead durante a qualificacao apos ele confirmar a situacao de credito.',
    false,
    '[{"alvo":"nome","tipo":"captura"}]'::jsonb,
    'nicho', v_nicho_id, v_threshold, 'max', true, 'pending'
  );

  -- 4/9 apresentacao/1 — Agente explicou o processo juridico
  INSERT INTO public.fase_requisitos
    (fase, ordem, descricao_curta, descricao_semantica, obrigatorio, evidencias,
     escopo, nicho_id, threshold, combinacao_evidencias, ativo, embedding_status)
  VALUES (
    'apresentacao', 1,
    'Agente explicou o processo juridico',
    'Agente explicou que o produto e um processo juridico de remocao legal das negativacoes, com impacto direto no acesso a credito do lead.',
    true,
    '[{"alvo":"produto_apresentado","tipo":"flag"},{"role":"assistant","tipo":"sinal_semantico","min_score":0.3,"janela_turnos":3}]'::jsonb,
    'nicho', v_nicho_id, v_threshold, 'max', true, 'pending'
  );

  -- 5/9 apresentacao/2 — Lead identificou o produto
  INSERT INTO public.fase_requisitos
    (fase, ordem, descricao_curta, descricao_semantica, obrigatorio, evidencias,
     escopo, nicho_id, threshold, combinacao_evidencias, ativo, embedding_status)
  VALUES (
    'apresentacao', 2,
    'Lead identificou o produto',
    'Lead demonstrou que entendeu qual e o produto sendo oferecido (Limpa Nome via processo juridico).',
    false,
    '[{"alvo":"produto_identificado","tipo":"captura"},{"alvo":"identificar_produto","tipo":"trigger","min_score":0.3,"janela_turnos":5}]'::jsonb,
    'nicho', v_nicho_id, v_threshold, 'max', true, 'pending'
  );

  -- 6/9 negociacao/1 — Valores foram apresentados
  INSERT INTO public.fase_requisitos
    (fase, ordem, descricao_curta, descricao_semantica, obrigatorio, evidencias,
     escopo, nicho_id, threshold, combinacao_evidencias, ativo, embedding_status)
  VALUES (
    'negociacao', 1,
    'Valores foram apresentados',
    'Agente apresentou os valores oficiais do produto (a vista e/ou parcelado) ao lead.',
    true,
    '[{"alvo":"neg_valores_apresentados","tipo":"flag"},{"role":"assistant","tipo":"sinal_semantico","min_score":0.3,"janela_turnos":3}]'::jsonb,
    'nicho', v_nicho_id, v_threshold, 'max', true, 'pending'
  );

  -- 7/9 negociacao/2 — Lead aceitou avancar para fechamento
  INSERT INTO public.fase_requisitos
    (fase, ordem, descricao_curta, descricao_semantica, obrigatorio, evidencias,
     escopo, nicho_id, threshold, combinacao_evidencias, ativo, embedding_status)
  VALUES (
    'negociacao', 2,
    'Lead aceitou avancar para fechamento',
    'Lead aceitou avancar para o fechamento e pediu para gerar/enviar o contrato. Frases tipicas: pode gerar, pode enviar agora, manda contrato, vamos fechar, fechado, aceito, quero, vamos.',
    true,
    '[{"alvo":"gerar_contrato","tipo":"trigger","min_score":0.35,"janela_turnos":5},{"role":"user","tipo":"sinal_semantico","min_score":0.3,"janela_turnos":3},{"tipo":"aceite","min_score":0.3,"janela_turnos":2,"pergunta_esperada":"Posso gerar o contrato pra voce assinar agora?"},{"role":"user","tipo":"heuristica_pt_br","flags":"i","regex":"\\b(pode|manda|fechou|beleza|aceito|t[ôo]\\s+dentro|vamo|bora|claro\\s+que\\s+pode|pode\\s+(mandar|gerar|enviar))\\b","janela_turnos":3,"score_quando_bate":0.85}]'::jsonb,
    'nicho', v_nicho_id, v_threshold, 'max', true, 'pending'
  );

  -- 8/9 fechado/1 — Contrato assinado
  INSERT INTO public.fase_requisitos
    (fase, ordem, descricao_curta, descricao_semantica, obrigatorio, evidencias,
     escopo, nicho_id, threshold, combinacao_evidencias, ativo, embedding_status)
  VALUES (
    'fechado', 1,
    'Contrato assinado',
    'Lead assinou o contrato. Flag contrato_assinado deve estar marcada como sim.',
    true,
    '[{"alvo":"contrato_assinado","tipo":"captura","valor_esperado":"sim"}]'::jsonb,
    'nicho', v_nicho_id, v_threshold, 'max', true, 'pending'
  );

  -- 9/9 fechado/2 — Comprovante de pagamento validado
  INSERT INTO public.fase_requisitos
    (fase, ordem, descricao_curta, descricao_semantica, obrigatorio, evidencias,
     escopo, nicho_id, threshold, combinacao_evidencias, ativo, embedding_status)
  VALUES (
    'fechado', 2,
    'Comprovante de pagamento validado',
    'Comprovante de pagamento foi recebido e validado. Flag comprovante_validado deve estar marcada como sim.',
    true,
    '[{"alvo":"comprovante_validado","tipo":"captura","valor_esperado":"sim"}]'::jsonb,
    'nicho', v_nicho_id, v_threshold, 'max', true, 'pending'
  );

  -- Desativa os 9 do escopo agente Lucas (preserva historico, nao apaga)
  UPDATE public.fase_requisitos
  SET ativo = false, updated_at = now()
  WHERE agent_id = v_agent_lucas
    AND escopo = 'agente'
    AND ativo = true;

  RAISE NOTICE 'Migration concluida: 9 fase_requisitos no escopo nicho limpa_nome inseridos, 9 do escopo agente Lucas desativados.';
END $$;
;

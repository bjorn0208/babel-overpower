-- Cadastra 33 chunks novos em trigger_chunks (idempotente via nome_trigger).
-- ONDA 3 do plano automacoes-semanticas. Frases reais extraídas do Apêndice A
-- (A.1 pagamento, A.3 assinatura) cross-tenant. Thresholds temporais calibrados
-- por A.2 histograma de silêncio (mediana/p75/p90 por contexto).
-- ---------------------------------------------------------------------------

-- ===== BLOCO 1 · criar_scheduled_action_pagamento (frase) · 12 chunks =====

INSERT INTO public.trigger_chunks
  (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, categoria, ativo, embedding_status)
SELECT * FROM (VALUES
  ('pagamento_dia_numerico_explicito',
    'Mas só posso pagar no dia 27',
    'criar_scheduled_action_pagamento',
    '{"quando":"dia_mes_isolado","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_entrada_dia_numerico',
    'Deixa eu so pegar esse dinheiro da entrada dia 25',
    'criar_scheduled_action_pagamento',
    '{"quando":"dia_mes_isolado","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_recebo_dia_X',
    'Eu só recebo dia 10',
    'criar_scheduled_action_pagamento',
    '{"quando":"recebe_no_dia","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_amanha_entrada',
    'Consigo pagar amanhã a entrada',
    'criar_scheduled_action_pagamento',
    '{"quando":"amanha","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_apos_recebimento_vale',
    'A hora que entrar o meu vale eu faço o pix só me passa o valor',
    'criar_scheduled_action_pagamento',
    '{"quando":"apos_pagamento_salario","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_depois_do_dia',
    'Depois do dia 20 t chamo Pq eu recebo meu vale',
    'criar_scheduled_action_pagamento',
    '{"quando":"depois_do_dia","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_data_completa_dd_mm',
    'Sim, mais essa entrada só teria dia 03/05',
    'criar_scheduled_action_pagamento',
    '{"quando":"data_completa","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_data_completa_yyyy',
    'Eu só posso a entrada no dia 02/05/26',
    'criar_scheduled_action_pagamento',
    '{"quando":"data_completa","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_pix_amanha_negativa_hoje',
    'Não consigo fazer Pix hj. Só amanhã',
    'criar_scheduled_action_pagamento',
    '{"quando":"amanha","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_dia_X_ou_Y_alternativa',
    'Sim vamos. Dia 14 ou 15 farei o Pix da entrada ok? Neste caso voltamos a nos falar dia 14',
    'criar_scheduled_action_pagamento',
    '{"quando":"dia_mes_isolado","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_pergunta_data_proposta',
    'Vc pode botar para mim pagar a entrada dia 15 de abril?',
    'criar_scheduled_action_pagamento',
    '{"quando":"data_completa","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending'),

  ('pagamento_recebo_dia_pequena_pausa',
    'Mais só recebo dia 10',
    'criar_scheduled_action_pagamento',
    '{"quando":"recebe_no_dia","iniciativa":"lead"}'::jsonb,
    'global','frase','pagamento_data',true,'pending')
) AS v(nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, categoria, ativo, embedding_status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trigger_chunks tc WHERE tc.nome_trigger = v.nome_trigger
);

-- ===== BLOCO 2 · criar_scheduled_action_assinatura (frase) · 8 chunks =====
-- Handler vem na ONDA 4. Chunks já ficam prontos pra quando o switch case existir.

INSERT INTO public.trigger_chunks
  (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, categoria, ativo, embedding_status)
SELECT * FROM (VALUES
  ('assinatura_amanha_explicito',
    'Posso assinar amanhã sem falta?',
    'criar_scheduled_action_assinatura',
    '{"quando":"amanha","iniciativa":"lead"}'::jsonb,
    'global','frase','assinatura_data',true,'pending'),

  ('assinatura_compromisso_amanha',
    'Então amanhã eu assino e vc me passa a chave pix',
    'criar_scheduled_action_assinatura',
    '{"quando":"amanha","iniciativa":"lead"}'::jsonb,
    'global','frase','assinatura_data',true,'pending'),

  ('assinatura_dinheiro_em_conta',
    'Então vamos fazer o combinado eu assino o contrato amanhã que e quando tenho dinheiro em conta',
    'criar_scheduled_action_assinatura',
    '{"quando":"amanha","iniciativa":"lead"}'::jsonb,
    'global','frase','assinatura_data',true,'pending'),

  ('assinatura_vou_ler_contrato',
    'Vou ler o contrato e te falo amanhã',
    'criar_scheduled_action_assinatura',
    '{"quando":"amanha","iniciativa":"lead"}'::jsonb,
    'global','frase','assinatura_data',true,'pending'),

  ('assinatura_dia_numerico',
    'Posso fechar contrato dia 6',
    'criar_scheduled_action_assinatura',
    '{"quando":"dia_mes_isolado","iniciativa":"lead"}'::jsonb,
    'global','frase','assinatura_data',true,'pending'),

  ('assinatura_data_completa',
    'Vou assinar dia 15/05',
    'criar_scheduled_action_assinatura',
    '{"quando":"data_completa","iniciativa":"lead"}'::jsonb,
    'global','frase','assinatura_data',true,'pending'),

  ('assinatura_volta_pra_assinar',
    'Volto pra assinar segunda',
    'criar_scheduled_action_assinatura',
    '{"quando":"dia_semana","iniciativa":"lead"}'::jsonb,
    'global','frase','assinatura_data',true,'pending'),

  ('assinatura_te_confirmo_amanha',
    'Te confirmo a assinatura amanhã sem falta',
    'criar_scheduled_action_assinatura',
    '{"quando":"amanha","iniciativa":"lead"}'::jsonb,
    'global','frase','assinatura_data',true,'pending')
) AS v(nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, categoria, ativo, embedding_status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trigger_chunks tc WHERE tc.nome_trigger = v.nome_trigger
);

-- ===== BLOCO 3 · silencio_pos_fase (temporal) · 4 chunks =====
-- Calibração: A.2 mostra mediana 1.7min, p75 14.7min, p90 600min (10h) cross.
-- Sequência substitui automacoes.intervalos[*] fixo (5min hoje).

INSERT INTO public.trigger_chunks
  (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, tempo_aguardar_minutos, fase_aplicavel, categoria, ativo, embedding_status)
SELECT * FROM (VALUES
  ('silencio_60min_primeira_retomada',
    'lead silencia depois de qualquer fase, primeira retomada empática em 1h',
    'enviar_followup_silencio',
    '{"tom":"empatico","tentativa":1}'::jsonb,
    'global','silencio_pos_fase',60,NULL,'silencio',true,'pending'),

  ('silencio_360min_segunda_retomada',
    'lead silencia, segunda retomada após 6h reforçando contexto da última conversa',
    'enviar_followup_silencio',
    '{"tom":"contextual","tentativa":2}'::jsonb,
    'global','silencio_pos_fase',360,NULL,'silencio',true,'pending'),

  ('silencio_1440min_terceira_retomada',
    'lead silencia, terceira retomada 24h depois retomando ponto de parada',
    'enviar_followup_silencio',
    '{"tom":"direto","tentativa":3}'::jsonb,
    'global','silencio_pos_fase',1440,NULL,'silencio',true,'pending'),

  ('silencio_4320min_quarta_retomada',
    'lead silencia há 72h, última retomada antes de marcar como inativo',
    'enviar_followup_silencio',
    '{"tom":"final","tentativa":4}'::jsonb,
    'global','silencio_pos_fase',4320,NULL,'silencio',true,'pending')
) AS v(nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, tempo_aguardar_minutos, fase_aplicavel, categoria, ativo, embedding_status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trigger_chunks tc WHERE tc.nome_trigger = v.nome_trigger
);

-- ===== BLOCO 4 · nao_assinou_contrato (temporal) · 3 chunks =====
-- Substitui cobranca_assinatura.tentativas fixas (1h/24h/72h hoje).

INSERT INTO public.trigger_chunks
  (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, tempo_aguardar_minutos, categoria, ativo, embedding_status)
SELECT * FROM (VALUES
  ('contrato_60min_primeira_cobranca',
    'contrato enviado há 1h sem assinatura, primeira cobrança empática',
    'cobranca_assinatura_followup',
    '{"tom":"empatico","tentativa":1}'::jsonb,
    'global','nao_assinou_contrato',60,'cobranca_assinatura',true,'pending'),

  ('contrato_1440min_segunda_cobranca',
    'contrato enviado há 24h sem assinatura, segunda cobrança direta perguntando se tem dúvida',
    'cobranca_assinatura_followup',
    '{"tom":"direto","tentativa":2}'::jsonb,
    'global','nao_assinou_contrato',1440,'cobranca_assinatura',true,'pending'),

  ('contrato_4320min_terceira_cobranca',
    'contrato enviado há 72h sem assinatura, última cobrança antes de marcar como expirado',
    'cobranca_assinatura_followup',
    '{"tom":"final","tentativa":3}'::jsonb,
    'global','nao_assinou_contrato',4320,'cobranca_assinatura',true,'pending')
) AS v(nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, tempo_aguardar_minutos, categoria, ativo, embedding_status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trigger_chunks tc WHERE tc.nome_trigger = v.nome_trigger
);

-- ===== BLOCO 5 · nao_enviou_comprovante (temporal) · 3 chunks =====
-- Substitui cobranca_pagamento.pos_assinatura_sem_data_prometida.tentativas (2h/24h/72h hoje).

INSERT INTO public.trigger_chunks
  (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, tempo_aguardar_minutos, categoria, ativo, embedding_status)
SELECT * FROM (VALUES
  ('comprovante_120min_primeira',
    'lead assinou há 2h e ainda não enviou comprovante de pagamento, primeira lembrança empática',
    'cobranca_pagamento_followup',
    '{"tom":"empatico","tentativa":1}'::jsonb,
    'global','nao_enviou_comprovante',120,'cobranca_pagamento',true,'pending'),

  ('comprovante_1440min_segunda',
    'lead assinou há 24h e ainda não enviou comprovante de pagamento, segunda lembrança direta',
    'cobranca_pagamento_followup',
    '{"tom":"direto","tentativa":2}'::jsonb,
    'global','nao_enviou_comprovante',1440,'cobranca_pagamento',true,'pending'),

  ('comprovante_4320min_terceira',
    'lead assinou há 72h e ainda não enviou comprovante, última cobrança antes de escalar humano',
    'cobranca_pagamento_followup',
    '{"tom":"final","tentativa":3}'::jsonb,
    'global','nao_enviou_comprovante',4320,'cobranca_pagamento',true,'pending')
) AS v(nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, tempo_aguardar_minutos, categoria, ativo, embedding_status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trigger_chunks tc WHERE tc.nome_trigger = v.nome_trigger
);

-- ===== BLOCO 6 · nao_respondeu_proposta (temporal) · 3 chunks =====

INSERT INTO public.trigger_chunks
  (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, tempo_aguardar_minutos, categoria, ativo, embedding_status)
SELECT * FROM (VALUES
  ('proposta_120min_primeira',
    'agente apresentou proposta há 2h e lead não respondeu, primeira retomada perguntando dúvida',
    'enviar_followup_silencio',
    '{"tom":"empatico","tentativa":1}'::jsonb,
    'global','nao_respondeu_proposta',120,'silencio_proposta',true,'pending'),

  ('proposta_1440min_segunda',
    'agente apresentou proposta há 24h e lead não respondeu, segunda retomada direta',
    'enviar_followup_silencio',
    '{"tom":"direto","tentativa":2}'::jsonb,
    'global','nao_respondeu_proposta',1440,'silencio_proposta',true,'pending'),

  ('proposta_4320min_terceira',
    'agente apresentou proposta há 72h sem resposta, última retomada antes de marcar como recusa baixa',
    'enviar_followup_silencio',
    '{"tom":"final","tentativa":3}'::jsonb,
    'global','nao_respondeu_proposta',4320,'silencio_proposta',true,'pending')
) AS v(nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, condicao_tipo, tempo_aguardar_minutos, categoria, ativo, embedding_status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trigger_chunks tc WHERE tc.nome_trigger = v.nome_trigger
);
;

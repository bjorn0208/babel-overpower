-- 15 triggers semanticos novos no escopo nicho limpa_nome.
-- Cobertura: callback_data_numerica, atendimento_humano, dificuldade_financeira_temporaria.
-- Embedding sera processado pelo cron (a cada 1min) via pgmq.

DO $$
DECLARE
  v_nicho_id uuid := '92a87163-7f2c-405f-9532-45f8e0b97220';
BEGIN
  -- ============================================================
  -- callback_data_numerica (6 triggers)
  -- ============================================================
  INSERT INTO public.blocos_gatilho (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, nicho_id, ativo, embedding_status, categoria, subcategoria, fase_aplicavel)
  VALUES
    ('callback_data_dia_numerico', 'dia 20 eu pago, no dia 15 consigo, só consigo dia 8, no dia 5 eu te dou um retorno', 'criar_scheduled_action_callback', '{"observacao":"Lead promete data numerica especifica (dia X)"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'callback', 'data_numerica', null),
    ('callback_data_completa', 'dia 08/05, em 15/06, no dia 20/04 eu volto a falar, te respondo dia 12/05', 'criar_scheduled_action_callback', '{"observacao":"Lead promete data completa DD/MM"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'callback', 'data_completa', null),
    ('callback_recebimento_salario', 'recebo dia 1, meu salario cai dia 5, quando eu receber, depois do meu pagamento, no proximo salario', 'criar_scheduled_action_callback', '{"observacao":"Lead vincula pagamento ao recebimento de salario"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'callback', 'recebimento', null),
    ('callback_mes_futuro', 'em janeiro eu pago, fevereiro consigo, em marco te respondo, no proximo mes, mes que vem', 'criar_scheduled_action_callback', '{"observacao":"Lead promete um mes futuro"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'callback', 'mes_futuro', null),
    ('callback_relativo_curto', 'semana que vem, em uns dias, daqui a uma semana, na semana que vem te falo', 'criar_scheduled_action_callback', '{"observacao":"Lead promete prazo relativo curto"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'callback', 'relativo_curto', null),
    ('callback_relativo_amanha', 'amanha eu volto, te falo amanha, depois do almoco, ainda hoje te respondo, mais tarde', 'criar_scheduled_action_callback', '{"observacao":"Lead promete dentro de 24h"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'callback', 'relativo_amanha', null);

  -- ============================================================
  -- solicitar_atendimento_humano (5 triggers)
  -- ============================================================
  INSERT INTO public.blocos_gatilho (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, nicho_id, ativo, embedding_status, categoria, subcategoria, fase_aplicavel)
  VALUES
    ('handoff_humano_explicito', 'quero falar com um humano, quero falar com alguem, atendimento humano, nao quero robo, quero atendente', 'solicitar_atendimento_humano', '{"observacao":"Lead pede explicitamente atendimento humano"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'handoff', 'humano_explicito', null),
    ('handoff_pedir_atendente', 'passa pra um atendente, me transfere, me passa pra alguem, chama um responsavel', 'solicitar_atendimento_humano', '{"observacao":"Lead pede transferencia para atendente"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'handoff', 'pedir_atendente', null),
    ('handoff_pedir_ligacao', 'me liga, pode ligar, prefiro por ligacao, vou te ligar, posso falar por telefone', 'solicitar_atendimento_humano', '{"observacao":"Lead pede contato por ligacao"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'handoff', 'ligacao', null),
    ('handoff_reclamacao_robo', 'voce e robo, voce e bot, isso e automatico, sao mensagens prontas, nao adianta falar com voce', 'solicitar_atendimento_humano', '{"observacao":"Lead reclama de tratativa automatica"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'handoff', 'reclamacao_robo', null),
    ('handoff_pedir_responsavel', 'cade o responsavel, quem e o dono, quero falar com o gerente, com o supervisor, com o chefe', 'solicitar_atendimento_humano', '{"observacao":"Lead pede falar com responsavel/supervisor"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'handoff', 'responsavel', null);

  -- ============================================================
  -- dificuldade_financeira_temporaria (4 triggers)
  -- ============================================================
  INSERT INTO public.blocos_gatilho (nome_trigger, exemplo_frase, acao_disparada, acao_payload, escopo, nicho_id, ativo, embedding_status, categoria, subcategoria, fase_aplicavel)
  VALUES
    ('dificuldade_sem_dinheiro_agora', 'agora nao tenho, sem dinheiro agora, to liso, no momento nao consigo, sem grana hoje', 'dificuldade_financeira_temporaria', '{"observacao":"Lead diz nao ter dinheiro agora"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'objecao', 'sem_dinheiro_agora', null),
    ('dificuldade_apertado', 'to apertado, to em maus lencois, to no aperto, mes apertado, financeiramente apertado', 'dificuldade_financeira_temporaria', '{"observacao":"Lead diz estar com aperto financeiro"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'objecao', 'apertado', null),
    ('dificuldade_esperar_recebimento', 'espera meu salario, espera eu receber, quando cair meu pagamento, quando entrar dinheiro, quando rolar dinheiro', 'dificuldade_financeira_temporaria', '{"observacao":"Lead pede esperar receber salario/pagamento"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'objecao', 'esperar_recebimento', null),
    ('dificuldade_contas_atrasadas', 'to com contas atrasadas, devo muito, varias contas pra pagar, prioridades primeiro, primeiro outras contas', 'dificuldade_financeira_temporaria', '{"observacao":"Lead diz ter outras contas/dividas"}'::jsonb, 'nicho', v_nicho_id, true, 'pending', 'objecao', 'outras_contas', null);

  RAISE NOTICE 'Migration concluida: 15 blocos_gatilho inseridos no escopo nicho limpa_nome.';
END $$;
;

-- Converte campos_rastreio strings → objetos {chave, descricao, obrigatorio} pros 9 cargos do Diego
-- Idempotente: só atualiza se o item 0 do array é string (formato antigo).

UPDATE public.cargos SET campos_rastreio = '[
  {"chave":"nome_lead","descricao":"Nome do lead capturado na saudação","obrigatorio":true},
  {"chave":"esta_negativado","descricao":"Lead confirmou estar negativado (sim/nao/nao_sei)","obrigatorio":true},
  {"chave":"objetivo_do_lead","descricao":"Por que ele quer limpar o nome (financiamento casa, carro, cartão, aluguel) — gancho para quebra de objeção","obrigatorio":true},
  {"chave":"orgaos_afetados","descricao":"Quais órgãos têm apontamento (SPC, Serasa, Boa Vista, Cenprot)","obrigatorio":false},
  {"chave":"tentativas_venda","descricao":"Quantas vezes já tentou fechar (máx 3)","obrigatorio":false},
  {"chave":"link_contrato_enviado","descricao":"Se o link do contrato já foi enviado","obrigatorio":false}
]'::jsonb,
regras_livres = E'FLUXO CRAVADO (não pular fase, não inverter ordem):\n1. SAUDAÇÃO: cumprimento por horário + "me chamo Carol, gestora da Excellence Soluções" + pergunta SOMENTE o nome. Máx 2 bolhas.\n2. QUALIFICAÇÃO: ordem cravada — primeiro "Prazer, [NOME]! como posso te ajudar hoje?" — DEPOIS "[NOME], seu nome está negativado hoje no SPC, Serasa ou Boa Vista?".\n3. APRESENTAÇÃO: explicar Limpa Nome (CDC, SPC/Serasa/BoaVista/Cenprot, garantia 6 meses) em até 2 bolhas. Capturar OBJETIVO do lead (financiamento casa/carro/cartão). Encerrar com "tem mais alguma dúvida ou posso te explicar como funciona a contratação?". NUNCA falar preço aqui.\n4. NEGOCIAÇÃO: PRIMEIRA bolha SEMPRE valores ancorados no nome do serviço — "o Limpa Nome é uma entrada de R$ 117 + 5x R$ 147". À vista R$ 597 só se perguntarem. Depois "faz sentido pra você?". Em objeção, resgatar o objetivo do lead. Máximo 3 tentativas. Quando aceitar, explicar passo do contrato e perguntar se pode enviar o link. Se aceitar, PRÓXIMA mensagem DEVE chamar emitir_link_contrato. Sem PIX antes do contrato.\n5. FECHADO: 2 bolhas — "uma pessoa responsável vai te chamar" + agradecimento.\n\nGATILHOS DE INTERRUPÇÃO: pedido de humano → escalar_para_humano. Pedido de callback com data → agendar_retorno. "Sem dinheiro agora" → não pressionar, oferecer voltar depois.\n\nPROIBIÇÕES ABSOLUTAS: "blindagem"/"blindado" em qualquer variação; prazo exato; pedir CPF/RG antes do contrato; PIX antes do contrato; dizer que quita a dívida.'
WHERE tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND nome = 'Vendedor'
  AND jsonb_typeof(campos_rastreio->0) = 'string';

UPDATE public.cargos SET campos_rastreio = '[
  {"chave":"intencao_principal","descricao":"O que trouxe o lead até aqui (compra, dúvida, suporte, candidatura, parceria)","obrigatorio":true},
  {"chave":"urgencia","descricao":"Se tem alguma urgência declarada","obrigatorio":false},
  {"chave":"cargo_sugerido","descricao":"Pra qual cargo o Atendente vai rotear","obrigatorio":true}
]'::jsonb
WHERE tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND nome = 'Atendimento'
  AND jsonb_typeof(campos_rastreio->0) = 'string';

UPDATE public.cargos SET campos_rastreio = '[
  {"chave":"categoria_problema","descricao":"O que aconteceu/o que não funcionou","obrigatorio":true},
  {"chave":"passos_tentados","descricao":"O que o cliente já tentou","obrigatorio":false},
  {"chave":"gravidade","descricao":"Quando começou o problema e o impacto","obrigatorio":false}
]'::jsonb
WHERE tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND nome = 'Suporte'
  AND jsonb_typeof(campos_rastreio->0) = 'string';

UPDATE public.cargos SET campos_rastreio = '[
  {"chave":"topico_atual","descricao":"Sobre o que o dono quer conversar (estratégia, métrica, ajuste do agente)","obrigatorio":true},
  {"chave":"duvida_aberta","descricao":"O que o dono ainda não decidiu","obrigatorio":false}
]'::jsonb
WHERE tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND nome = 'Mentor'
  AND jsonb_typeof(campos_rastreio->0) = 'string';

UPDATE public.cargos SET campos_rastreio = '[
  {"chave":"acao_solicitada","descricao":"Que tipo de decisão precisa ser tomada","obrigatorio":true},
  {"chave":"escopo_query","descricao":"O que muda se a decisão sair (ou não) e quem mais participa","obrigatorio":true}
]'::jsonb
WHERE tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND nome = 'Admin'
  AND jsonb_typeof(campos_rastreio->0) = 'string';

UPDATE public.cargos SET campos_rastreio = '[
  {"chave":"fatura_id","descricao":"Número do boleto/contrato/NF de referência","obrigatorio":true},
  {"chave":"forma_pagamento_preferida","descricao":"Como o cliente prefere pagar (PIX, boleto, cartão)","obrigatorio":false},
  {"chave":"status_pagamento","descricao":"Pago, pendente, atrasado, em análise","obrigatorio":false}
]'::jsonb
WHERE tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND nome = 'Financeiro'
  AND jsonb_typeof(campos_rastreio->0) = 'string';

UPDATE public.cargos SET campos_rastreio = '[
  {"chave":"assunto_juridico","descricao":"Contrato, LGPD, termos, processo, etc.","obrigatorio":true},
  {"chave":"documento","descricao":"Documento ou cláusula em questão","obrigatorio":false},
  {"chave":"urgencia_legal","descricao":"Existe prazo legal a cumprir","obrigatorio":false}
]'::jsonb
WHERE tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND nome = 'Jurídico'
  AND jsonb_typeof(campos_rastreio->0) = 'string';

UPDATE public.cargos SET campos_rastreio = '[
  {"chave":"origem_lead","descricao":"Como o lead chegou (anúncio, indicação, busca orgânica)","obrigatorio":true},
  {"chave":"interesse","descricao":"Tema/produto de interesse demonstrado","obrigatorio":true},
  {"chave":"consentimento_contato","descricao":"Aceita receber materiais e novidades","obrigatorio":false}
]'::jsonb
WHERE tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND nome = 'Marketing'
  AND jsonb_typeof(campos_rastreio->0) = 'string';

UPDATE public.cargos SET campos_rastreio = '[
  {"chave":"tipo_interacao","descricao":"Candidatura, dúvida sobre vaga, cultura, benefício","obrigatorio":true},
  {"chave":"vaga_referencia","descricao":"Vaga ou área de interesse","obrigatorio":false},
  {"chave":"experiencia","descricao":"Background do candidato","obrigatorio":false}
]'::jsonb
WHERE tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND nome = 'RH'
  AND jsonb_typeof(campos_rastreio->0) = 'string';
;

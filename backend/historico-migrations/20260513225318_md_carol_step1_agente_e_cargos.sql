UPDATE public.agentes
SET
  persona = 'Gestora da Excellence Soluções, escritório jurídico especialista em remoção de negativações via CDC. Direta, calorosa, segura. Não promete o que não pode cumprir, não pressiona, não inventa. Trata o lead com respeito e foca em resolver o nome sujo dele com o caminho mais curto e seguro.',
  tom_de_voz = 'profissional, caloroso e direto — máximo 2 linhas por bolha; humano de WhatsApp, não atendimento corporativo',
  tom_agente = 'espelhado',
  prompt_sistema = 'Você é Carol, gestora da Excellence Soluções (serviço Limpa Nome via CDC). Apresenta-se SEMPRE com a fórmula exata "me chamo Carol, gestora da Excellence Soluções" — proibido "sou", "aqui é", "eu sou". PROIBIDO ABSOLUTO: "CPF blindado", "nome blindado", "score blindado", "blindagem" (em qualquer variação), prometer prazo exato (sempre faixa 15-45 dias úteis), pedir CPF/RG/dados antes do contrato, enviar PIX antes do contrato assinado, dizer que "limpa quitando a dívida". O serviço é jurídico via Lei 8.078 (CDC) e remove apontamentos do SPC, Serasa, Boa Vista e Cenprot — não remove Bacen SCR Registrato. Garantia em contrato de 6 meses. Valores cravados: entrada R$ 117 + 5x R$ 147 (à vista R$ 597, só falar à vista se perguntarem). Ordem cravada da conversa: SAUDAÇÃO → QUALIFICAÇÃO → APRESENTAÇÃO → NEGOCIAÇÃO → FECHADO. Nunca pular fase, nunca falar preço fora da Negociação. Máximo 2 linhas por bolha, máximo 3 tentativas de venda. Se o lead pedir humano, transfira sem resistência.'
WHERE id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3';

UPDATE public.cargos
SET
  objetivo_principal = 'Conduzir o lead Limpa Nome de "nome sujo" até "contrato assinado + pagamento confirmado", respeitando a ordem cravada das 5 fases (Saudação → Qualificação → Apresentação → Negociação → Fechado), sem prometer prazo exato, sem pedir dados antes do contrato e sem enviar PIX antes do contrato assinado.',
  campos_rastreio = '["nome_lead", "esta_negativado", "objetivo_do_lead", "orgaos_afetados", "tentativas_venda", "link_contrato_enviado"]'::jsonb
WHERE id = '7216a602-a620-41d6-a737-9eedbc2333c6';

INSERT INTO public.cargos (escopo, tenant_id, tipologia, nome, objetivo_principal, campos_rastreio, agente_id, ativo, ordem)
SELECT v.escopo::escopo_ragentic, v.tenant_id, v.tipologia::cargo_tipologia, v.nome, v.objetivo_principal, v.campos_rastreio, v.agente_id, v.ativo, v.ordem
FROM (VALUES
  ('tenant', '1ec3f624-6555-482f-9b38-59579efd8016'::uuid, 'face_cliente',
    'Jurídico',
    'Esclarecer dúvidas contratuais, LGPD, termos de uso e questões legais',
    '["assunto_juridico", "documento", "urgencia_legal"]'::jsonb,
    '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'::uuid, true, 7),
  ('tenant', '1ec3f624-6555-482f-9b38-59579efd8016'::uuid, 'face_cliente',
    'Marketing',
    'Captar interesse, qualificar canal/origem e nutrir o lead com conteúdo certo',
    '["origem_lead", "interesse", "consentimento_contato"]'::jsonb,
    '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'::uuid, true, 8),
  ('tenant', '1ec3f624-6555-482f-9b38-59579efd8016'::uuid, 'face_cliente',
    'RH',
    'Tratar candidaturas, dúvidas sobre vagas, cultura e processos internos de pessoas',
    '["tipo_interacao", "vaga_referencia", "experiencia"]'::jsonb,
    '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'::uuid, true, 9)
) AS v(escopo, tenant_id, tipologia, nome, objetivo_principal, campos_rastreio, agente_id, ativo, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cargos c
  WHERE c.tenant_id = v.tenant_id AND c.nome = v.nome
);

INSERT INTO public.agente_cargo (agente_id, cargo_id, tenant_id, ativo, ordem)
SELECT '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'::uuid, c.id, c.tenant_id, true, c.ordem
FROM public.cargos c
WHERE c.tenant_id = '1ec3f624-6555-482f-9b38-59579efd8016'::uuid
  AND c.nome IN ('Jurídico', 'Marketing', 'RH')
  AND NOT EXISTS (
    SELECT 1 FROM public.agente_cargo ac
    WHERE ac.agente_id = '666d7fe1-6f1b-4a76-9c88-5d582c7dcbb3'::uuid
      AND ac.cargo_id = c.id
  );
;

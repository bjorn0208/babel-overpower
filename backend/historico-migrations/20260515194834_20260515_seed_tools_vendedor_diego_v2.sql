INSERT INTO public.ferramentas_dinamicas (escopo, tenant_id, nome_tool, descricao, schema_zod, endpoint_url, metodo, dominio_allowlist, ativo)
VALUES
  (
    'global', NULL,
    'criar_contrato_do_template',
    'Cria instância de contrato a partir do template ativo do tenant, preenchendo dados_cliente com a ficha do lead. Idempotente: se já existe contrato pra essa conversa, retorna o existente. Retorna chave_publica + link público.',
    '{"type":"object","properties":{"produto_slug":{"type":"string","description":"(opcional) slug/nome do produto se tenant tiver +1 template ativo"}}}'::jsonb,
    'internal://criar_contrato_do_template',
    'POST',
    '',
    true
  ),
  (
    'global', NULL,
    'validar_comprovante',
    'Valida comprovante de pagamento via Gemini Flash (vision). Retorna eh_comprovante + valor_extraido + valor_bate (se valor_esperado for passado). Falha graceful: se vision indisponível, sinaliza ao agente que precisa validação humana.',
    '{"type":"object","required":["comprovante_url"],"properties":{"comprovante_url":{"type":"string","description":"URL pública da imagem/PDF do comprovante"},"valor_esperado":{"type":"number","description":"(opcional) valor em reais pra comparar"}}}'::jsonb,
    'internal://validar_comprovante',
    'POST',
    '',
    true
  )
ON CONFLICT DO NOTHING;

WITH vend AS (
  SELECT id FROM public.cargos
  WHERE id = '7216a602-a620-41d6-a737-9eedbc2333c6'
),
tools_alvo AS (
  SELECT id, nome_tool FROM public.ferramentas_dinamicas
  WHERE escopo = 'global'
    AND nome_tool IN (
      'buscar_blocos_conhecimento',
      'atualizar_prancheta',
      'criar_contrato_do_template',
      'enviar_link_contrato',
      'validar_comprovante',
      'marcar_contrato_assinado',
      'transferir_humano',
      'gerenciar_compromisso'
    )
)
INSERT INTO public.cargo_ferramentas (cargo_id, ferramenta_id, obrigatoria, ordem)
SELECT vend.id, tools_alvo.id, false, 0
  FROM vend CROSS JOIN tools_alvo
ON CONFLICT (cargo_id, ferramenta_id) DO NOTHING;
;

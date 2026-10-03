-- 1) Seed: ativa cargo 'atendimento' global para todo agente sem cargo
WITH cargo_atendimento AS (
  SELECT id FROM public.cargos WHERE escopo='global' AND nome='atendimento' AND ativo=true LIMIT 1
)
INSERT INTO public.agente_cargo (agente_id, cargo_id, tenant_id, ativo, ordem)
SELECT a.id, ca.id, a.user_id, true, 0
FROM public.agentes_usuario a
CROSS JOIN cargo_atendimento ca
WHERE NOT EXISTS (
  SELECT 1 FROM public.agente_cargo ac WHERE ac.agente_id = a.id
);

-- 2) Ferramenta buscar_blocos_conhecimento
INSERT INTO public.ferramentas_dinamicas (nome_tool, descricao, escopo, endpoint_url, schema_zod, ativo, dominio_allowlist)
SELECT
  'buscar_blocos_conhecimento',
  'Consulta blocos de conhecimento (RAG) do tenant + nicho + global filtrando opcionalmente por cargo, tags e busca textual. Use quando precisar de informação factual antes de responder.',
  'global',
  'internal://buscar_blocos_conhecimento',
  '{"type":"object","properties":{"busca":{"type":"string","description":"Texto livre para busca por palavras-chave"},"tags":{"type":"array","items":{"type":"string"},"description":"Filtra blocos contendo essas tags"},"limite":{"type":"integer","minimum":1,"maximum":20,"default":8}},"additionalProperties":false}'::jsonb,
  true,
  ARRAY[]::text[]
WHERE NOT EXISTS (SELECT 1 FROM public.ferramentas_dinamicas WHERE nome_tool='buscar_blocos_conhecimento');

-- 3) Ferramenta atualizar_prancheta
INSERT INTO public.ferramentas_dinamicas (nome_tool, descricao, escopo, endpoint_url, schema_zod, ativo, dominio_allowlist)
SELECT
  'atualizar_prancheta',
  'Atualiza/insere campos da prancheta (ficha viva) da conversa atual. Use para registrar fatos extraídos do turno: nome, objeção, intenção, próxima ação, etc.',
  'global',
  'internal://atualizar_prancheta',
  '{"type":"object","properties":{"campos":{"type":"object","description":"Objeto chave→valor a mesclar na prancheta","additionalProperties":true},"resumo_agente":{"type":"string","description":"Opcional: resumo curto do estado atual da conversa"}},"required":["campos"],"additionalProperties":false}'::jsonb,
  true,
  ARRAY[]::text[]
WHERE NOT EXISTS (SELECT 1 FROM public.ferramentas_dinamicas WHERE nome_tool='atualizar_prancheta');

-- 4) Vínculos cargo_ferramentas
INSERT INTO public.cargo_ferramentas (cargo_id, ferramenta_id, ordem, obrigatoria)
SELECT c.id, f.id, 50, false
FROM public.cargos c
JOIN public.ferramentas_dinamicas f ON f.nome_tool = 'buscar_blocos_conhecimento'
WHERE c.escopo='global' AND c.ativo=true
  AND c.nome IN ('atendimento','vendedor','financeiro','suporte','mentor')
ON CONFLICT (cargo_id, ferramenta_id) DO NOTHING;

INSERT INTO public.cargo_ferramentas (cargo_id, ferramenta_id, ordem, obrigatoria)
SELECT c.id, f.id, 60, false
FROM public.cargos c
JOIN public.ferramentas_dinamicas f ON f.nome_tool = 'atualizar_prancheta'
WHERE c.escopo='global' AND c.ativo=true
  AND c.nome IN ('atendimento','vendedor','financeiro','suporte')
ON CONFLICT (cargo_id, ferramenta_id) DO NOTHING;
;

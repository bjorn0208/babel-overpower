INSERT INTO public.ferramentas_dinamicas (nome_tool, descricao, escopo, endpoint_url, schema_zod, ativo, dominio_allowlist)
SELECT
  'buscar_gatilhos_reativos',
  'Consulta gatilhos reativos aplicáveis (ações pré-definidas que disparam por cenário, palavra-chave ou agendamento).',
  'global',
  'internal://buscar_gatilhos_reativos',
  '{"type":"object","properties":{"cenario":{"type":"string"},"limite":{"type":"integer","minimum":1,"maximum":50,"default":20}},"additionalProperties":false}'::jsonb,
  true,
  ARRAY[]::text[]
WHERE NOT EXISTS (SELECT 1 FROM public.ferramentas_dinamicas WHERE nome_tool = 'buscar_gatilhos_reativos');

INSERT INTO public.cargo_ferramentas (cargo_id, ferramenta_id, ordem, obrigatoria)
SELECT c.id, f.id, 90, false
FROM public.cargos c
JOIN public.ferramentas_dinamicas f ON f.nome_tool = 'buscar_gatilhos_reativos'
WHERE c.escopo = 'global' AND c.ativo = true
  AND c.nome IN ('atendimento','vendedor','financeiro','suporte','mentor')
ON CONFLICT (cargo_id, ferramenta_id) DO NOTHING;
;

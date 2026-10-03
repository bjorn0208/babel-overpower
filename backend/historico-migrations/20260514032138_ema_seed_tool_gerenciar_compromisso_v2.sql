-- Onda 2 EMA seed tool gerenciar_compromisso (escopo=global)
INSERT INTO public.ferramentas_dinamicas (
  nome_tool, descricao, endpoint_url, metodo, schema_zod,
  escopo, dominio_allowlist, precisa_aprovacao, ativo, tenant_id
)
SELECT
  'gerenciar_compromisso',
  'Cria, atualiza ou cancela um compromisso futuro com o lead (retorno, reunião, callback). SEMPRE consulte <compromissos_ativos_do_lead> ANTES — se já existe em janela ±4h, use acao=atualizar com ref_id. Idempotente via request_id.',
  'internal://gerenciar_compromisso',
  'POST',
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('acao', 'request_id'),
    'properties', jsonb_build_object(
      'acao', jsonb_build_object(
        'type', 'string',
        'enum', jsonb_build_array('criar', 'atualizar', 'cancelar')
      ),
      'ref_id', jsonb_build_object('type', 'string'),
      'request_id', jsonb_build_object('type', 'string'),
      'titulo', jsonb_build_object('type', 'string'),
      'quando_relativo', jsonb_build_object('type', 'object'),
      'executar_em', jsonb_build_object('type', 'string')
    )
  ),
  'global'::escopo_ragentic,
  'internal',
  false,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.ferramentas_dinamicas WHERE nome_tool = 'gerenciar_compromisso'
);

INSERT INTO public.cargo_ferramentas (cargo_id, ferramenta_id, obrigatoria, ordem)
SELECT c.id, f.id, false, 5
FROM public.cargos c
CROSS JOIN public.ferramentas_dinamicas f
WHERE f.nome_tool = 'gerenciar_compromisso'
  AND c.ativo = true
  AND c.tipologia IN ('atendimento', 'face_cliente', 'mentor')
  AND NOT EXISTS (
    SELECT 1 FROM public.cargo_ferramentas cf
    WHERE cf.cargo_id = c.id AND cf.ferramenta_id = f.id
  );
;

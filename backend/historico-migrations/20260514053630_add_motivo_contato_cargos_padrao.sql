-- A5: motivo_contato como obrigatório no Vendedor Carol + cargos globais atendimento
-- Idempotente: só adiciona se não existe.

-- 1) Vendedor Carol (cargo tenant Diego)
UPDATE public.cargos
SET campos_rastreio = campos_rastreio || jsonb_build_array(
  jsonb_build_object('chave', 'motivo_contato', 'descricao', 'O que o lead procura ou precisa neste contato (gancho para qualificação)', 'obrigatorio', true)
)
WHERE id = '7216a602-a620-41d6-a737-9eedbc2333c6'
  AND jsonb_typeof(campos_rastreio) = 'array'
  AND NOT (campos_rastreio @> '[{"chave":"motivo_contato"}]'::jsonb);

-- 2) Cargos globais atendimento — só se já estiverem no formato novo (objetos)
-- Cargo "Atendimento" global atual usa formato ANTIGO (array de strings) — vamos primeiro normalizar pra objetos
UPDATE public.cargos
SET campos_rastreio = jsonb_build_array(
  jsonb_build_object('chave', 'motivo_contato', 'descricao', 'O que o lead procura ou precisa neste contato', 'obrigatorio', true),
  jsonb_build_object('chave', 'nome_lead', 'descricao', 'Nome do lead capturado', 'obrigatorio', true),
  jsonb_build_object('chave', 'urgencia', 'descricao', 'Nivel de urgencia detectado (alta/media/baixa)', 'obrigatorio', false),
  jsonb_build_object('chave', 'cargo_sugerido', 'descricao', 'Cargo sugerido para roteamento', 'obrigatorio', false)
)
WHERE escopo = 'global'
  AND tipologia = 'atendimento'
  AND ativo = true
  AND jsonb_typeof(campos_rastreio) = 'array'
  AND (
    (jsonb_array_length(campos_rastreio) > 0 AND jsonb_typeof(campos_rastreio->0) = 'string')
    OR NOT (campos_rastreio @> '[{"chave":"motivo_contato"}]'::jsonb)
  );
;

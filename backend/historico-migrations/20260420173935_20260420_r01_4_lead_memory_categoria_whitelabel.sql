
-- ============================================================
-- Wave 1 Ajuste R01.4 — lead_memory.categoria white-label
-- UP: Substitui constraint de categoria por 9 valores genéricos
-- DOWN: ALTER TABLE public.lead_memory DROP CONSTRAINT lead_memory_categoria_check;
--       (sem constraint — ou restaurar com os valores anteriores)
-- ============================================================

-- Remove constraint anterior (se existente de migration anterior)
ALTER TABLE public.lead_memory
  DROP CONSTRAINT IF EXISTS lead_memory_categoria_check;

-- Adiciona constraint white-label com 9 categorias universais
ALTER TABLE public.lead_memory
  ADD CONSTRAINT lead_memory_categoria_check
  CHECK (categoria IN (
    'demografico',
    'familia',
    'financeiro',
    'trabalho',
    'saude',
    'interesse',
    'objecao',
    'historico_relacionamento',
    'outro'
  ));

-- Documenta cada categoria para o agente e desenvolvedores
COMMENT ON COLUMN public.lead_memory.categoria IS
  'Classificação white-label do fato memorizado (sem referência a nicho específico). '
  'demografico — idade, gênero, cidade, estado civil, profissão declarada. '
  'familia — filhos, cônjuge, dependentes, situação familiar. '
  'financeiro — renda, patrimônio, dívidas, investimentos, restrições no nome. '
  'trabalho — empresa, cargo, tempo de experiência, histórico de desemprego. '
  'saude — condições de saúde, histórico médico, medicamentos em uso. '
  'interesse — hobbies, desejos, planos de vida, compras pretendidas. '
  'objecao — barreiras declaradas, preocupações, resistências ao produto/serviço. '
  'historico_relacionamento — já contratou/pagou/reclamou/cancelou, status atual do relacionamento. '
  'outro — fallback quando não encaixa nos 8 acima. Padrão do sistema.';

;

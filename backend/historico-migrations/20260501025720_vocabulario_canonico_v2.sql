
-- ========================================================
-- Migration: vocabulario_canonico_v2
-- Fase 1 · PLANO-UNIFICADO-campanha-base · 2026-05-01
-- ========================================================

-- PART 1 · Novas colunas em vocabulario_curadoria
ALTER TABLE public.vocabulario_curadoria
  ADD COLUMN IF NOT EXISTS chave text,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'enum',
  ADD COLUMN IF NOT EXISTS multivalor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validacao_regex text;

-- Index para lookup por chave ativa
CREATE INDEX IF NOT EXISTS idx_vocab_curadoria_chave_escopo
  ON public.vocabulario_curadoria (chave, escopo)
  WHERE ativo = true AND chave IS NOT NULL;

-- Unique index para seed idempotente
CREATE UNIQUE INDEX IF NOT EXISTS vocab_curadoria_unique_chave_valor_escopo
  ON public.vocabulario_curadoria (
    COALESCE(chave, ''),
    valor,
    escopo,
    COALESCE(nicho_id::text, ''),
    COALESCE(tenant_id::text, '')
  );

-- PART 2 · Trigger NOTIFY quando vocabulário muda (edge fn invalida cache)
CREATE OR REPLACE FUNCTION public.tg_vocab_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_notify('vocabulario_atualizado', '');
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_vocab_notify ON public.vocabulario_curadoria;
CREATE TRIGGER trg_vocab_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.vocabulario_curadoria
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tg_vocab_notify();

-- PART 3 · Tabela tag_vocabulario_alias
CREATE TABLE IF NOT EXISTS public.tag_vocabulario_alias (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alias          text        NOT NULL,
  chave_canonica text        NOT NULL,
  valor_canonico text        NOT NULL,
  escopo         text        NOT NULL DEFAULT 'plataforma',
  nicho_id       uuid        REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id      uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  origem         text        NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'merge_aprovado')),
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_vocab_alias_unique
  ON public.tag_vocabulario_alias (
    alias,
    escopo,
    COALESCE(nicho_id::text, ''),
    COALESCE(tenant_id::text, '')
  );

CREATE INDEX IF NOT EXISTS idx_tag_vocab_alias_chave
  ON public.tag_vocabulario_alias (chave_canonica, escopo);

CREATE INDEX IF NOT EXISTS idx_tag_vocab_alias_tenant
  ON public.tag_vocabulario_alias (tenant_id)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.tag_vocabulario_alias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tag_vocab_alias_select" ON public.tag_vocabulario_alias
  FOR SELECT TO authenticated
  USING (
    escopo = 'plataforma'
    OR (escopo = 'nicho' AND nicho_id IN (
      SELECT p.nicho_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
    ))
    OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
  );

CREATE POLICY "tag_vocab_alias_insert" ON public.tag_vocabulario_alias
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_platform_admin())
    OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
  );

CREATE POLICY "tag_vocab_alias_update" ON public.tag_vocabulario_alias
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT public.is_platform_admin())
    OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
  );

CREATE POLICY "tag_vocab_alias_delete" ON public.tag_vocabulario_alias
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
  );

-- PART 4 · Seed das 30 chaves canônicas (escopo plataforma)
INSERT INTO public.vocabulario_curadoria
  (contexto, chave, valor, rotulo, descricao, tipo, multivalor, escopo, ativo)
VALUES
-- ── IDENTIDADE (4 chaves) ────────────────────────────────
('tag_lead','nome_completo',     '', 'Nome completo',    'Nome completo do lead (texto livre)',                              'texto',  false,'plataforma',true),
('tag_lead','documento_pessoal', '', 'CPF / CNPJ',       'Documento pessoal — armazenado no cofre PII, exibido mascarado',  'masked', false,'plataforma',true),
('tag_lead','localizacao',       '', 'Localização',      'Cidade-UF do lead (ex: São Paulo-SP)',                             'texto',  false,'plataforma',true),
('tag_lead','profissao','autonomo',          'Autônomo',             NULL,'enum',false,'plataforma',true),
('tag_lead','profissao','clt',               'CLT',                  NULL,'enum',false,'plataforma',true),
('tag_lead','profissao','aposentado',        'Aposentado',           NULL,'enum',false,'plataforma',true),
('tag_lead','profissao','empresario',        'Empresário',           NULL,'enum',false,'plataforma',true),
('tag_lead','profissao','desempregado',      'Desempregado',         NULL,'enum',false,'plataforma',true),
('tag_lead','profissao','mei',               'MEI',                  NULL,'enum',false,'plataforma',true),
('tag_lead','profissao','funcionario_publico','Funcionário público',  NULL,'enum',false,'plataforma',true),
-- ── INTENÇÃO (4 chaves) ──────────────────────────────────
('tag_lead','objetivo','emagrecer',        'Emagrecer',                NULL,'enum',true,'plataforma',true),
('tag_lead','objetivo','perder_peso',      'Perder peso',              NULL,'enum',true,'plataforma',true),
('tag_lead','objetivo','ganhar_massa',     'Ganhar massa',             NULL,'enum',true,'plataforma',true),
('tag_lead','objetivo','melhorar_postura', 'Melhorar postura',         NULL,'enum',true,'plataforma',true),
('tag_lead','objetivo','tirar_nome',       'Tirar o nome do cadastro', NULL,'enum',true,'plataforma',true),
('tag_lead','objetivo','quitar_divida',    'Quitar dívida',            NULL,'enum',true,'plataforma',true),
('tag_lead','objetivo','negociar_acordo',  'Negociar acordo',          NULL,'enum',true,'plataforma',true),
('tag_lead','objetivo','comprar_imovel',   'Comprar imóvel',           NULL,'enum',true,'plataforma',true),
('tag_lead','objetivo','montar_negocio',   'Montar negócio',           NULL,'enum',true,'plataforma',true),
('tag_lead','objetivo','aprender_skill',   'Aprender habilidade',      NULL,'enum',true,'plataforma',true),
('tag_lead','urgencia','imediata',         'Urgência imediata', NULL,'enum',false,'plataforma',true),
('tag_lead','urgencia','esta_semana',      'Esta semana',       NULL,'enum',false,'plataforma',true),
('tag_lead','urgencia','esta_quinzena',    'Esta quinzena',     NULL,'enum',false,'plataforma',true),
('tag_lead','urgencia','este_mes',         'Este mês',          NULL,'enum',false,'plataforma',true),
('tag_lead','urgencia','proximos_meses',   'Próximos meses',    NULL,'enum',false,'plataforma',true),
('tag_lead','urgencia','sem_urgencia',     'Sem urgência',      NULL,'enum',false,'plataforma',true),
('tag_lead','interesse_produto','','Produto de interesse','Valores definidos por tenant','enum',true,'plataforma',true),
('tag_lead','objecao','preco_alto',            'Preço alto',               NULL,'enum',true,'plataforma',true),
('tag_lead','objecao','falta_dinheiro',        'Falta dinheiro',           NULL,'enum',true,'plataforma',true),
('tag_lead','objecao','precisa_pensar',        'Precisa pensar',           NULL,'enum',true,'plataforma',true),
('tag_lead','objecao','vai_consultar_familia', 'Vai consultar família',    NULL,'enum',true,'plataforma',true),
('tag_lead','objecao','nao_confia_modalidade', 'Não confia na modalidade', NULL,'enum',true,'plataforma',true),
('tag_lead','objecao','ja_tentou_antes',       'Já tentou antes',          NULL,'enum',true,'plataforma',true),
('tag_lead','objecao','prefere_outro',         'Prefere outro',            NULL,'enum',true,'plataforma',true),
-- ── PRODUTO (3 chaves) ───────────────────────────────────
('tag_lead','produto_identificado','','Produto identificado','Produto de interesse direto — freeform por tenant','enum',true,'plataforma',true),
('tag_lead','produto_indicado',   '','Produto indicado',   'Melhor encaixe identificado pelo agente','enum',false,'plataforma',true),
('tag_lead','experiencia_anterior','nunca_tentou',      'Nunca tentou',            NULL,'enum',true,'plataforma',true),
('tag_lead','experiencia_anterior','ja_tentou_falhou',  'Já tentou e falhou',      NULL,'enum',true,'plataforma',true),
('tag_lead','experiencia_anterior','ja_tentou_sucesso', 'Já tentou e teve sucesso',NULL,'enum',true,'plataforma',true),
('tag_lead','experiencia_anterior','usa_concorrente',   'Usa concorrente',         NULL,'enum',true,'plataforma',true),
('tag_lead','experiencia_anterior','desconhece_solucao','Desconhece a solução',    NULL,'enum',true,'plataforma',true),
-- ── COBRANÇA / NEGATIVAÇÃO (8 chaves) ────────────────────
('tag_lead','valor_divida','','Valor da dívida','Valor em R$ da dívida total','numero',false,'plataforma',true),
('tag_lead','tipo_divida','cartao_credito',        'Cartão de crédito',       NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','cheque_especial',       'Cheque especial',         NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','emprestimo_pessoal',    'Empréstimo pessoal',      NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','financiamento_veiculo', 'Financiamento de veículo',NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','financiamento_imovel',  'Financiamento imobiliário',NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','iptu',         'IPTU',             NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','ipva',         'IPVA',             NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','condominio',   'Condomínio',       NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','aluguel',      'Aluguel',          NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','agua',         'Água',             NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','luz',          'Energia elétrica', NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','internet',     'Internet',         NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','telefone',     'Telefone',         NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','loja',         'Loja / financeira',NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','boleto_avulso','Boleto avulso',    NULL,'enum',true,'plataforma',true),
('tag_lead','tipo_divida','outros',       'Outros',           NULL,'enum',true,'plataforma',true),
('tag_lead','origem_divida','acesso_facil_cartao','Acesso fácil ao cartão',NULL,'enum',false,'plataforma',true),
('tag_lead','origem_divida','gasto_acima_renda',  'Gastos acima da renda', NULL,'enum',false,'plataforma',true),
('tag_lead','origem_divida','desemprego',          'Desemprego',            NULL,'enum',false,'plataforma',true),
('tag_lead','origem_divida','doenca',              'Doença',                NULL,'enum',false,'plataforma',true),
('tag_lead','origem_divida','divorcio',            'Divórcio',              NULL,'enum',false,'plataforma',true),
('tag_lead','origem_divida','negocio_falido',      'Negócio falido',        NULL,'enum',false,'plataforma',true),
('tag_lead','origem_divida','imprevisto',          'Imprevisto',            NULL,'enum',false,'plataforma',true),
('tag_lead','tempo_divida','menos_1_mes','Menos de 1 mês',NULL,'enum',false,'plataforma',true),
('tag_lead','tempo_divida','1_3_meses',  '1 a 3 meses',   NULL,'enum',false,'plataforma',true),
('tag_lead','tempo_divida','3_6_meses',  '3 a 6 meses',   NULL,'enum',false,'plataforma',true),
('tag_lead','tempo_divida','6_12_meses', '6 a 12 meses',  NULL,'enum',false,'plataforma',true),
('tag_lead','tempo_divida','1_2_anos',   '1 a 2 anos',    NULL,'enum',false,'plataforma',true),
('tag_lead','tempo_divida','2_5_anos',   '2 a 5 anos',    NULL,'enum',false,'plataforma',true),
('tag_lead','tempo_divida','mais_5_anos','Mais de 5 anos', NULL,'enum',false,'plataforma',true),
('tag_lead','motivo_negativacao','inadimplencia_cartao','Inadimplência cartão',NULL,'enum',false,'plataforma',true),
('tag_lead','motivo_negativacao','cheque_devolvido',    'Cheque devolvido',   NULL,'enum',false,'plataforma',true),
('tag_lead','motivo_negativacao','boleto_atraso',       'Boleto em atraso',   NULL,'enum',false,'plataforma',true),
('tag_lead','motivo_negativacao','acordo_quebrado',     'Acordo quebrado',    NULL,'enum',false,'plataforma',true),
('tag_lead','status_negativacao','negativado',              'Negativado',              NULL,'enum',false,'plataforma',true),
('tag_lead','status_negativacao','regular',                 'Regular',                 NULL,'enum',false,'plataforma',true),
('tag_lead','status_negativacao','em_acordo',               'Em acordo',               NULL,'enum',false,'plataforma',true),
('tag_lead','status_negativacao','parcialmente_negativado',  'Parcialmente negativado', NULL,'enum',false,'plataforma',true),
('tag_lead','status_negativacao','desconhecido',             'Desconhecido',            NULL,'enum',false,'plataforma',true),
('tag_lead','orgao_negativador','serasa',          'Serasa',               NULL,'enum',true,'plataforma',true),
('tag_lead','orgao_negativador','spc',             'SPC',                  NULL,'enum',true,'plataforma',true),
('tag_lead','orgao_negativador','scpc',            'SCPC',                 NULL,'enum',true,'plataforma',true),
('tag_lead','orgao_negativador','boa_vista',       'Boa Vista',            NULL,'enum',true,'plataforma',true),
('tag_lead','orgao_negativador','cartorio_protesto','Cartório de protesto', NULL,'enum',true,'plataforma',true),
('tag_lead','orgao_negativador','outros',          'Outros',               NULL,'enum',true,'plataforma',true),
('tag_lead','quantidade_dividas','','Quantidade de dívidas','Número de dívidas (inteiro)','numero',false,'plataforma',true),
-- ── PAGAMENTO (5 chaves) ─────────────────────────────────
('tag_lead','forma_pagamento_preferida','pix',           'Pix',              NULL,'enum',true,'plataforma',true),
('tag_lead','forma_pagamento_preferida','boleto',        'Boleto',           NULL,'enum',true,'plataforma',true),
('tag_lead','forma_pagamento_preferida','cartao_credito','Cartão de crédito',NULL,'enum',true,'plataforma',true),
('tag_lead','forma_pagamento_preferida','cartao_debito', 'Cartão de débito', NULL,'enum',true,'plataforma',true),
('tag_lead','forma_pagamento_preferida','dinheiro',      'Dinheiro',         NULL,'enum',true,'plataforma',true),
('tag_lead','forma_pagamento_preferida','transferencia', 'Transferência',    NULL,'enum',true,'plataforma',true),
('tag_lead','pix_chave',               '','Chave Pix',          'Chave pix — cofre PII','masked',false,'plataforma',true),
('tag_lead','pix_valor',               '','Valor Pix',           'Valor em R$ para Pix',  'numero',false,'plataforma',true),
('tag_lead','data_pagamento_prometida','','Data de pagamento prometida','Data que o lead prometeu pagar','data',false,'plataforma',true),
('tag_lead','valor_acordado',          '','Valor acordado','Valor final negociado','numero',false,'plataforma',true),
-- ── NEGOCIAÇÃO (4 chaves) ────────────────────────────────
('tag_lead','neg_ciclos',    '','Ciclos de negociação',  'Quantidade de ciclos','numero',false,'plataforma',true),
('tag_lead','neg_substatus','sem_resposta',          'Sem resposta',          NULL,'enum',false,'plataforma',true),
('tag_lead','neg_substatus','respondeu_sem_promessa','Respondeu sem promessa', NULL,'enum',false,'plataforma',true),
('tag_lead','neg_substatus','prometeu_pagar',        'Prometeu pagar',         NULL,'enum',false,'plataforma',true),
('tag_lead','neg_substatus','pediu_prazo',           'Pediu prazo',            NULL,'enum',false,'plataforma',true),
('tag_lead','neg_substatus','pediu_desconto',        'Pediu desconto',         NULL,'enum',false,'plataforma',true),
('tag_lead','neg_substatus','aceitou_acordo',        'Aceitou acordo',         NULL,'enum',false,'plataforma',true),
('tag_lead','neg_substatus','recusou_acordo',        'Recusou acordo',         NULL,'enum',false,'plataforma',true),
('tag_lead','neg_substatus','pagou',                 'Pagou',                  NULL,'enum',false,'plataforma',true),
('tag_lead','neg_substatus','quebrou_promessa',      'Quebrou promessa',        NULL,'enum',false,'plataforma',true),
('tag_lead','neg_tentativas','','Tentativas de negociação','Número de tentativas de contato','numero',false,'plataforma',true),
('tag_lead','data_retorno',  '','Data de retorno',       'Data para retomar contato','data',false,'plataforma',true),
-- ── ENGAJAMENTO (2 chaves) ───────────────────────────────
('tag_lead','temperatura','frio',  'Frio',  NULL,'enum',false,'plataforma',true),
('tag_lead','temperatura','morno', 'Morno', NULL,'enum',false,'plataforma',true),
('tag_lead','temperatura','quente','Quente',NULL,'enum',false,'plataforma',true),
('tag_lead','disponibilidade','agora',         'Agora',             NULL,'enum',false,'plataforma',true),
('tag_lead','disponibilidade','esta_semana',   'Esta semana',       NULL,'enum',false,'plataforma',true),
('tag_lead','disponibilidade','proxima_semana','Próxima semana',    NULL,'enum',false,'plataforma',true),
('tag_lead','disponibilidade','este_mes',      'Este mês',          NULL,'enum',false,'plataforma',true),
('tag_lead','disponibilidade','mes_que_vem',   'Mês que vem',       NULL,'enum',false,'plataforma',true),
('tag_lead','disponibilidade','sem_data',      'Sem data definida', NULL,'enum',false,'plataforma',true)
ON CONFLICT DO NOTHING;

;

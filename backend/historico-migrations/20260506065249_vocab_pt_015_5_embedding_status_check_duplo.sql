-- Mig 15.5: CHECK duplo em embedding_status pra aceitar valores PT (pré-requisito Mig 16)
-- Mapeamento: pending→pendente, processing→processando, ready→pronto, error→erro, failed→falhou

-- Tabelas com 4 valores: pending, processing, ready, failed
DO $$
DECLARE
  v_tabelas text[] := ARRAY[
    'blocos_gatilho','blocos_humanizacao','blocos_meta','blocos_procedurais',
    'blocos_variacao','automacao_blocos','fase_requisitos','memoria_episodica',
    'memoria_lead','acao_pausa_blocos','blocos_comportamento'
  ];
  v_tabela text;
BEGIN
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', 
                   v_tabela, v_tabela || '_embedding_status_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (embedding_status = ANY (ARRAY[''pending''::text, ''processing''::text, ''ready''::text, ''failed''::text, ''pendente''::text, ''processando''::text, ''pronto''::text, ''falhou''::text]))',
      v_tabela, v_tabela || '_embedding_status_check'
    );
  END LOOP;
END $$;

-- Tabelas com 3 valores: pending, ready, error
DO $$
DECLARE
  v_tabelas text[] := ARRAY[
    'blocos_conhecimento','diretriz_bolha_blocos','emocao_blocos','agente_identidade',
    'anti_padroes','regras_operacionais_blocos','manipulacao_blocos',
    'pivots_categoria_intent','prova_social_blocos'
  ];
  v_tabela text;
BEGIN
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', 
                   v_tabela, v_tabela || '_embedding_status_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (embedding_status = ANY (ARRAY[''pending''::text, ''ready''::text, ''error''::text, ''pendente''::text, ''pronto''::text, ''erro''::text]))',
      v_tabela, v_tabela || '_embedding_status_check'
    );
  END LOOP;
END $$;

-- Tabelas com 4 valores: pending, ready, failed, error
DO $$
DECLARE
  v_tabelas text[] := ARRAY['admin_ia_memoria','admin_ia_blocos'];
  v_tabela text;
BEGIN
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', 
                   v_tabela, v_tabela || '_embedding_status_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (embedding_status = ANY (ARRAY[''pending''::text, ''ready''::text, ''failed''::text, ''error''::text, ''pendente''::text, ''pronto''::text, ''falhou''::text, ''erro''::text]))',
      v_tabela, v_tabela || '_embedding_status_check'
    );
  END LOOP;
END $$;

-- Tabela com 3 valores: pending, ready, failed
ALTER TABLE public.admin_ia_base_academica DROP CONSTRAINT IF EXISTS admin_ia_base_academica_embedding_status_check;
ALTER TABLE public.admin_ia_base_academica ADD CONSTRAINT admin_ia_base_academica_embedding_status_check 
  CHECK (embedding_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text, 'pendente'::text, 'pronto'::text, 'falhou'::text]));
;

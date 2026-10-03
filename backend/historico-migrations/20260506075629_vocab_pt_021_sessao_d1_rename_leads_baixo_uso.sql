-- Mig 21: Onda D1 da Sessão D — RENAME 7 colunas baixo uso em leads
-- Estratégia: RENAME + generated column com nome velho (read-only) pra leitura backward
-- Janela: 30-60 dias até confirmação que TS migrou pra nome novo. Drop em rodada futura.

-- 1. external_channel → canal_externo
ALTER TABLE public.leads RENAME COLUMN external_channel TO canal_externo;
ALTER TABLE public.leads ADD COLUMN external_channel TEXT GENERATED ALWAYS AS (canal_externo) STORED;

-- 2. external_id → id_externo
ALTER TABLE public.leads RENAME COLUMN external_id TO id_externo;
ALTER TABLE public.leads ADD COLUMN external_id TEXT GENERATED ALWAYS AS (id_externo) STORED;

-- 3. client_tasks → tarefas_cliente
ALTER TABLE public.leads RENAME COLUMN client_tasks TO tarefas_cliente;
ALTER TABLE public.leads ADD COLUMN client_tasks JSONB GENERATED ALWAYS AS (tarefas_cliente) STORED;

-- 4. provider_name → nome_provedor
ALTER TABLE public.leads RENAME COLUMN provider_name TO nome_provedor;
ALTER TABLE public.leads ADD COLUMN provider_name TEXT GENERATED ALWAYS AS (nome_provedor) STORED;

-- 5. lead_source → origem_lead
ALTER TABLE public.leads RENAME COLUMN lead_source TO origem_lead;
ALTER TABLE public.leads ADD COLUMN lead_source TEXT GENERATED ALWAYS AS (origem_lead) STORED;

-- 6. total_debt → divida_total
ALTER TABLE public.leads RENAME COLUMN total_debt TO divida_total;
ALTER TABLE public.leads ADD COLUMN total_debt NUMERIC GENERATED ALWAYS AS (divida_total) STORED;

-- 7. total_messages → total_mensagens
ALTER TABLE public.leads RENAME COLUMN total_messages TO total_mensagens;
ALTER TABLE public.leads ADD COLUMN total_messages INTEGER GENERATED ALWAYS AS (total_mensagens) STORED;

-- Validação: verificar que ambas as colunas existem
SELECT column_name, data_type, is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
  AND column_name IN ('canal_externo','external_channel','id_externo','external_id','tarefas_cliente','client_tasks','nome_provedor','provider_name','origem_lead','lead_source','divida_total','total_debt','total_mensagens','total_messages')
ORDER BY column_name;
;


-- Onda D3: agent_id → agente_id em 7 tabelas
-- Mecanismo: RENAME real + ADD COLUMN GENERATED ALWAYS AS STORED (read-backward compat)

-- 1. acoes_agendadas
ALTER TABLE public.acoes_agendadas RENAME COLUMN agent_id TO agente_id;
ALTER TABLE public.acoes_agendadas ADD COLUMN agent_id uuid GENERATED ALWAYS AS (agente_id) STORED;

-- 2. blocos_conhecimento
ALTER TABLE public.blocos_conhecimento RENAME COLUMN agent_id TO agente_id;
ALTER TABLE public.blocos_conhecimento ADD COLUMN agent_id uuid GENERATED ALWAYS AS (agente_id) STORED;

-- 3. buffer_mensagens (agent_id NOT NULL)
ALTER TABLE public.buffer_mensagens RENAME COLUMN agent_id TO agente_id;
ALTER TABLE public.buffer_mensagens ADD COLUMN agent_id uuid GENERATED ALWAYS AS (agente_id) STORED;

-- 4. contratos
ALTER TABLE public.contratos RENAME COLUMN agent_id TO agente_id;
ALTER TABLE public.contratos ADD COLUMN agent_id uuid GENERATED ALWAYS AS (agente_id) STORED;

-- 5. fase_requisitos
ALTER TABLE public.fase_requisitos RENAME COLUMN agent_id TO agente_id;
ALTER TABLE public.fase_requisitos ADD COLUMN agent_id uuid GENERATED ALWAYS AS (agente_id) STORED;

-- 6. fichas_lead (agent_id NOT NULL)
ALTER TABLE public.fichas_lead RENAME COLUMN agent_id TO agente_id;
ALTER TABLE public.fichas_lead ADD COLUMN agent_id uuid GENERATED ALWAYS AS (agente_id) STORED;

-- 7. leads
ALTER TABLE public.leads RENAME COLUMN agent_id TO agente_id;
ALTER TABLE public.leads ADD COLUMN agent_id uuid GENERATED ALWAYS AS (agente_id) STORED;

;

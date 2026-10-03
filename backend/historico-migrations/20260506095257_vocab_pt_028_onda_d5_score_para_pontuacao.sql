
ALTER TABLE public.admin_ia_reflexao RENAME COLUMN score TO pontuacao;
ALTER TABLE public.admin_ia_reflexao ADD COLUMN score numeric GENERATED ALWAYS AS (pontuacao) STORED;

ALTER TABLE public.engajamento_lead RENAME COLUMN score TO pontuacao;
ALTER TABLE public.engajamento_lead ADD COLUMN score numeric GENERATED ALWAYS AS (pontuacao) STORED;

ALTER TABLE public.leads RENAME COLUMN score TO pontuacao;
ALTER TABLE public.leads ADD COLUMN score integer GENERATED ALWAYS AS (pontuacao) STORED;

;

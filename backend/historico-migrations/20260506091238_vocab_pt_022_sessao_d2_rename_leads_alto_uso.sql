-- Mig 22: D2 — 8 colunas leads + correlatas em outras tabelas

-- leads (8)
ALTER TABLE public.leads RENAME COLUMN pipeline_stage TO fase_pipeline;
ALTER TABLE public.leads ADD COLUMN pipeline_stage TEXT GENERATED ALWAYS AS (fase_pipeline) STORED;

ALTER TABLE public.leads RENAME COLUMN product TO produto;
ALTER TABLE public.leads ADD COLUMN product TEXT GENERATED ALWAYS AS (produto) STORED;

ALTER TABLE public.leads RENAME COLUMN profile_photo_url TO url_foto_perfil;
ALTER TABLE public.leads ADD COLUMN profile_photo_url TEXT GENERATED ALWAYS AS (url_foto_perfil) STORED;

ALTER TABLE public.leads RENAME COLUMN display_name TO nome_exibicao;
ALTER TABLE public.leads ADD COLUMN display_name TEXT GENERATED ALWAYS AS (nome_exibicao) STORED;

ALTER TABLE public.leads RENAME COLUMN client_stage TO fase_cliente;
ALTER TABLE public.leads ADD COLUMN client_stage TEXT GENERATED ALWAYS AS (fase_cliente) STORED;

ALTER TABLE public.leads RENAME COLUMN style_profile TO perfil_estilo;
ALTER TABLE public.leads ADD COLUMN style_profile JSONB GENERATED ALWAYS AS (perfil_estilo) STORED;

ALTER TABLE public.leads RENAME COLUMN needs_human_help TO precisa_humano;
ALTER TABLE public.leads ADD COLUMN needs_human_help BOOLEAN GENERATED ALWAYS AS (precisa_humano) STORED;

ALTER TABLE public.leads RENAME COLUMN lead_temperature TO temperatura_lead;
ALTER TABLE public.leads ADD COLUMN lead_temperature TEXT GENERATED ALWAYS AS (temperatura_lead) STORED;

-- canais.profile_photo_url
ALTER TABLE public.canais RENAME COLUMN profile_photo_url TO url_foto_perfil;
ALTER TABLE public.canais ADD COLUMN profile_photo_url TEXT GENERATED ALWAYS AS (url_foto_perfil) STORED;

-- leads_campanha.style_profile
ALTER TABLE public.leads_campanha RENAME COLUMN style_profile TO perfil_estilo;
ALTER TABLE public.leads_campanha ADD COLUMN style_profile JSONB GENERATED ALWAYS AS (perfil_estilo) STORED;
;

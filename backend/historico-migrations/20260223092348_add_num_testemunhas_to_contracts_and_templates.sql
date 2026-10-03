ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS num_testemunhas integer NOT NULL DEFAULT 1;

ALTER TABLE public.contratos_template
  ADD COLUMN IF NOT EXISTS num_testemunhas integer NOT NULL DEFAULT 1;

ALTER TABLE public.contract_settings
  ADD COLUMN IF NOT EXISTS default_num_testemunhas integer NOT NULL DEFAULT 1;
;

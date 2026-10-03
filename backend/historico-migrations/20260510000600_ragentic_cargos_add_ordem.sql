ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS regras_livres text NOT NULL DEFAULT '';
;

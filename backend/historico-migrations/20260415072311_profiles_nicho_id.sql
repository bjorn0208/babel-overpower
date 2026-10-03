ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nicho_id uuid REFERENCES public.nichos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_nicho_id_idx ON public.profiles (nicho_id);

UPDATE public.profiles
SET nicho_id = (SELECT id FROM public.nichos WHERE slug = 'limpa_nome')
WHERE nicho_id IS NULL;
;

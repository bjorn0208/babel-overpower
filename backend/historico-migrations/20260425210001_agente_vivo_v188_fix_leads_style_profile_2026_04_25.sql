ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS style_profile jsonb DEFAULT '{}';
;

CREATE INDEX IF NOT EXISTS leads_style_profile_gin_idx ON public.leads USING gin (style_profile)
;

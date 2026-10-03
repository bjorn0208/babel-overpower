CREATE TABLE IF NOT EXISTS public.nichos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome_exibicao text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nichos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_nichos" ON public.nichos;
CREATE POLICY "auth_read_nichos" ON public.nichos
  FOR SELECT TO authenticated USING (ativo = true);

DROP POLICY IF EXISTS "service_role_all_nichos" ON public.nichos;
CREATE POLICY "service_role_all_nichos" ON public.nichos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS nichos_slug_idx ON public.nichos (slug);

INSERT INTO public.nichos (slug, nome_exibicao, descricao) VALUES
  ('limpa_nome', 'Limpa Nome / Cobrança Jurídica', 'Serviços jurídicos de remoção de negativações via CDC'),
  ('outro', 'Outro segmento', 'Nicho ainda não catalogado — chunks universais aplicam')
ON CONFLICT (slug) DO NOTHING;
;

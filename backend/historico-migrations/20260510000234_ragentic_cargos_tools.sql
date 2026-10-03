CREATE TABLE IF NOT EXISTS public.cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid REFERENCES public.agentes_usuario(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE SET NULL,
  nome text NOT NULL,
  objetivo_principal text NOT NULL,
  campos_rastreio_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated users" ON public.cargos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable all for tenant owners" ON public.cargos
  FOR ALL TO authenticated USING (tenant_id = (select auth.uid())) WITH CHECK (tenant_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS public.ferramentas_dinamicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  cargo_id uuid REFERENCES public.cargos(id) ON DELETE CASCADE,
  nome_tool text NOT NULL,
  descricao text NOT NULL,
  schema_zod_json jsonb NOT NULL,
  endpoint_url text NOT NULL,
  method text DEFAULT 'POST',
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.ferramentas_dinamicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated users" ON public.ferramentas_dinamicas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable all for tenant owners" ON public.ferramentas_dinamicas
  FOR ALL TO authenticated USING (tenant_id = (select auth.uid())) WITH CHECK (tenant_id = (select auth.uid()));

ALTER TABLE public.blocos_conhecimento ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL;
ALTER TABLE public.blocos_meta ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL;
ALTER TABLE public.blocos_comportamento ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL;
ALTER TABLE public.blocos_gatilho ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL;
ALTER TABLE public.blocos_humanizacao ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL;
ALTER TABLE public.blocos_variacao ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL;
ALTER TABLE public.blocos_procedurais ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL;
;

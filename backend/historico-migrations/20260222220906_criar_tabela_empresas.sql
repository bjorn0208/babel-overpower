CREATE TABLE public.empresas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  cnpj text DEFAULT '',
  endereco text DEFAULT '',
  tipo_presenca text NOT NULL DEFAULT 'digital' CHECK (tipo_presenca IN ('fisica', 'digital', 'ambos')),
  instagram text DEFAULT '',
  facebook text DEFAULT '',
  tiktok text DEFAULT '',
  whatsapp text DEFAULT '',
  descricao text DEFAULT '',
  logo_url text DEFAULT '',
  data_inicio date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresas_select_own" ON public.empresas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "empresas_insert_own" ON public.empresas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "empresas_update_own" ON public.empresas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "empresas_delete_own" ON public.empresas FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "empresas_admin_all" ON public.empresas FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
);
;

CREATE TABLE public.socios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  descricao text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "socios_select_own" ON public.socios FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.empresas WHERE id = socios.empresa_id AND user_id = auth.uid())
);
CREATE POLICY "socios_insert_own" ON public.socios FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.empresas WHERE id = socios.empresa_id AND user_id = auth.uid())
);
CREATE POLICY "socios_update_own" ON public.socios FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.empresas WHERE id = socios.empresa_id AND user_id = auth.uid())
);
CREATE POLICY "socios_delete_own" ON public.socios FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.empresas WHERE id = socios.empresa_id AND user_id = auth.uid())
);
CREATE POLICY "socios_admin_all" ON public.socios FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
);
;

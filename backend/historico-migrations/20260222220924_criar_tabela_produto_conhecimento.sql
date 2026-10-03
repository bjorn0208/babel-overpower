CREATE TABLE public.produto_conhecimento (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'conhecimento' CHECK (tipo IN ('conhecimento', 'objecao', 'faq')),
  titulo text NOT NULL DEFAULT '',
  conteudo text DEFAULT '',
  ordem integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.produto_conhecimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "produto_conhecimento_select_own" ON public.produto_conhecimento FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.produtos WHERE id = produto_conhecimento.produto_id AND user_id = auth.uid())
);
CREATE POLICY "produto_conhecimento_insert_own" ON public.produto_conhecimento FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.produtos WHERE id = produto_conhecimento.produto_id AND user_id = auth.uid())
);
CREATE POLICY "produto_conhecimento_update_own" ON public.produto_conhecimento FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.produtos WHERE id = produto_conhecimento.produto_id AND user_id = auth.uid())
);
CREATE POLICY "produto_conhecimento_delete_own" ON public.produto_conhecimento FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.produtos WHERE id = produto_conhecimento.produto_id AND user_id = auth.uid())
);
CREATE POLICY "produto_conhecimento_admin_all" ON public.produto_conhecimento FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
);
;

CREATE TABLE public.produtos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  descricao text DEFAULT '',
  preco numeric DEFAULT 0,
  prazo_entrega text DEFAULT '',
  garantia text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "produtos_select_own" ON public.produtos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "produtos_insert_own" ON public.produtos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "produtos_update_own" ON public.produtos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "produtos_delete_own" ON public.produtos FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "produtos_admin_all" ON public.produtos FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
);
;

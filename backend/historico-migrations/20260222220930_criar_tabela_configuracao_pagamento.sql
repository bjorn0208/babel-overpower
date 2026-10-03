CREATE TABLE public.configuracao_pagamento (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receber_pagamento boolean DEFAULT false,
  chave_pix text DEFAULT '',
  checklist_validacao jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.configuracao_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_pag_select_own" ON public.configuracao_pagamento FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "config_pag_insert_own" ON public.configuracao_pagamento FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "config_pag_update_own" ON public.configuracao_pagamento FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "config_pag_delete_own" ON public.configuracao_pagamento FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "config_pag_admin_all" ON public.configuracao_pagamento FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
);
;

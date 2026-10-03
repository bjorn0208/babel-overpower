
-- Adicionar colunas faltantes na tabela contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS company_description text;

-- RLS: usuario autenticado le/insere seus proprios contratos
CREATE POLICY "auth_select_own_contracts" ON public.contracts FOR SELECT TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IN (SELECT id FROM public.profiles WHERE parent_user_id = auth.uid()));

CREATE POLICY "auth_insert_own_contracts" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth.uid() OR tenant_id IN (SELECT id FROM public.profiles WHERE parent_user_id = auth.uid()));

-- RLS: anon pode ler contratos pelo token (pagina publica)
CREATE POLICY "anon_select_by_token" ON public.contracts FOR SELECT TO anon USING (true);

;

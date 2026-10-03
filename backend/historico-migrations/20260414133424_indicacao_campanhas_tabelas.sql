-- TABELA: indicacao_campanhas
CREATE TABLE IF NOT EXISTS public.indicacao_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text,
  telefone text,
  foto_url text,
  cupom text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  comissao_tipo text NOT NULL CHECK (comissao_tipo IN ('percentual', 'fixo')),
  comissao_valor numeric(12,2) NOT NULL CHECK (comissao_valor >= 0),
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'cancelada')),
  concluida_at timestamptz,
  pagamento_valor numeric(12,2),
  pagamento_data date,
  pagamento_metodo text,
  comprovante_url text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT indicacao_campanhas_periodo_valido CHECK (data_fim >= data_inicio),
  CONSTRAINT indicacao_campanhas_cupom_tenant_unique UNIQUE (tenant_id, cupom),
  CONSTRAINT indicacao_campanhas_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_indicacao_campanhas_tenant ON public.indicacao_campanhas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_indicacao_campanhas_status ON public.indicacao_campanhas(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_indicacao_campanhas_cupom_lookup ON public.indicacao_campanhas(tenant_id, lower(cupom)) WHERE deleted_at IS NULL AND status = 'ativa';
CREATE INDEX IF NOT EXISTS idx_indicacao_campanhas_token ON public.indicacao_campanhas(token);

ALTER TABLE public.indicacao_campanhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant le suas campanhas"
  ON public.indicacao_campanhas FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

CREATE POLICY "Tenant cria suas campanhas"
  ON public.indicacao_campanhas FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "Tenant atualiza suas campanhas"
  ON public.indicacao_campanhas FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "Tenant soft-delete suas campanhas"
  ON public.indicacao_campanhas FOR DELETE TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

CREATE POLICY "Publico le por token"
  ON public.indicacao_campanhas FOR SELECT TO anon
  USING (deleted_at IS NULL);

-- TABELA: indicacao_comissoes
CREATE TABLE IF NOT EXISTS public.indicacao_comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campanha_id uuid NOT NULL REFERENCES public.indicacao_campanhas(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  base_valor numeric(12,2),
  valor_comissao numeric(12,2) NOT NULL,
  comissao_tipo text NOT NULL,
  comissao_valor_congelado numeric(12,2) NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT indicacao_comissoes_lead_unique UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_indicacao_comissoes_tenant ON public.indicacao_comissoes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_indicacao_comissoes_campanha ON public.indicacao_comissoes(campanha_id);
CREATE INDEX IF NOT EXISTS idx_indicacao_comissoes_lead ON public.indicacao_comissoes(lead_id);

ALTER TABLE public.indicacao_comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant le suas comissoes"
  ON public.indicacao_comissoes FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

CREATE POLICY "Service role gerencia comissoes"
  ON public.indicacao_comissoes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Publico le comissoes por token"
  ON public.indicacao_comissoes FOR SELECT TO anon
  USING (campanha_id IN (SELECT id FROM public.indicacao_campanhas WHERE deleted_at IS NULL));

-- LEADS: FK
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS indicacao_campanha_id uuid REFERENCES public.indicacao_campanhas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_indicacao_campanha ON public.leads(indicacao_campanha_id) WHERE indicacao_campanha_id IS NOT NULL;
;

-- Config do assistente financeiro via WhatsApp: número do dono + toggle.
-- Roteamento no webhook SÓ ativa com ativo=true + numero_dono preenchido (fail-safe).
CREATE TABLE IF NOT EXISTS public.financeiro_config_tenant (
  tenant_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_dono text,
  ativo boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_config_numero_digitos CHECK (numero_dono IS NULL OR numero_dono ~ '^[0-9]{10,15}$')
);

COMMENT ON TABLE public.financeiro_config_tenant IS 'Assistente financeiro via WhatsApp: número do dono que conversa com o cargo Financeiro (canal interno).';

-- 2 tenants não podem reivindicar o mesmo número ativo
CREATE UNIQUE INDEX IF NOT EXISTS uk_financeiro_config_numero_ativo
  ON public.financeiro_config_tenant (numero_dono) WHERE ativo = true AND numero_dono IS NOT NULL;

ALTER TABLE public.financeiro_config_tenant ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'financeiro_config_tenant_all') THEN
    CREATE POLICY "financeiro_config_tenant_all" ON public.financeiro_config_tenant
      FOR ALL TO authenticated
      USING (tenant_id = (select auth.uid()))
      WITH CHECK (tenant_id = (select auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_financeiro_config_atualizado ON public.financeiro_config_tenant;
CREATE TRIGGER trg_financeiro_config_atualizado
  BEFORE UPDATE ON public.financeiro_config_tenant
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();
;

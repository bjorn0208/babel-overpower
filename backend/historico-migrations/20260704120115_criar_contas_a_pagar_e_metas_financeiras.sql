-- Contas a pagar (inclui dívida parcelada) + metas de compra/investimento do assistente financeiro.

CREATE TABLE IF NOT EXISTS public.contas_a_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  valor_total numeric NOT NULL CHECK (valor_total > 0),
  parcelas_total int NOT NULL DEFAULT 1 CHECK (parcelas_total >= 1),
  parcelas_pagas int NOT NULL DEFAULT 0 CHECK (parcelas_pagas >= 0),
  proximo_vencimento date,
  persistencia text NOT NULL DEFAULT 'aviso_unico' CHECK (persistencia IN ('sem_aviso','aviso_unico','insistir')),
  ultimo_lembrete_em timestamptz,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','quitada')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT contas_parcelas_coerentes CHECK (parcelas_pagas <= parcelas_total)
);

COMMENT ON TABLE public.contas_a_pagar IS 'Pagamentos por fazer do tenant (conta simples ou dívida parcelada). persistencia controla o lembrete do assistente: sem_aviso · aviso_unico · insistir (cobra 1×/dia até quitar).';
COMMENT ON COLUMN public.contas_a_pagar.proximo_vencimento IS 'Reagendável na conversa ("negociei, pago dia X").';

CREATE INDEX IF NOT EXISTS idx_contas_a_pagar_tenant
  ON public.contas_a_pagar (tenant_id) WHERE status = 'aberta' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contas_a_pagar_vencimento
  ON public.contas_a_pagar (proximo_vencimento) WHERE status = 'aberta' AND deleted_at IS NULL AND persistencia <> 'sem_aviso';

ALTER TABLE public.contas_a_pagar ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'contas_a_pagar_tenant_all') THEN
    CREATE POLICY "contas_a_pagar_tenant_all" ON public.contas_a_pagar
      FOR ALL TO authenticated
      USING (tenant_id = (select auth.uid()))
      WITH CHECK (tenant_id = (select auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_contas_a_pagar_atualizado ON public.contas_a_pagar;
CREATE TRIGGER trg_contas_a_pagar_atualizado
  BEFORE UPDATE ON public.contas_a_pagar
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

CREATE TABLE IF NOT EXISTS public.metas_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  valor_alvo numeric NOT NULL CHECK (valor_alvo > 0),
  foto_path text,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','concluida')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.metas_financeiras IS 'Metas de compra/investimento (ex: equipamento novo) com foto e valor alvo; progresso = soma dos movimentos com meta_id.';

CREATE INDEX IF NOT EXISTS idx_metas_financeiras_tenant
  ON public.metas_financeiras (tenant_id) WHERE deleted_at IS NULL;

ALTER TABLE public.metas_financeiras ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'metas_financeiras_tenant_all') THEN
    CREATE POLICY "metas_financeiras_tenant_all" ON public.metas_financeiras
      FOR ALL TO authenticated
      USING (tenant_id = (select auth.uid()))
      WITH CHECK (tenant_id = (select auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_metas_financeiras_atualizado ON public.metas_financeiras;
CREATE TRIGGER trg_metas_financeiras_atualizado
  BEFORE UPDATE ON public.metas_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- Vínculos no livro-caixa: parcela paga aponta a conta; aporte aponta a meta.
ALTER TABLE public.movimentos_financeiros
  ADD COLUMN IF NOT EXISTS conta_id uuid REFERENCES public.contas_a_pagar(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta_id uuid REFERENCES public.metas_financeiras(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_movimentos_financeiros_conta
  ON public.movimentos_financeiros (conta_id) WHERE conta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimentos_financeiros_meta
  ON public.movimentos_financeiros (meta_id) WHERE meta_id IS NOT NULL;

-- Realtime pras abas novas do app
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='contas_a_pagar') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contas_a_pagar;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='metas_financeiras') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.metas_financeiras;
  END IF;
END $$;
;

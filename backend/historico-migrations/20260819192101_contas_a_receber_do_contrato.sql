-- Recebíveis: contrato assinado gera entradas/a receber no Financeiro (2026-08-19)
CREATE TABLE IF NOT EXISTS public.contas_a_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  numero_parcela integer NOT NULL DEFAULT 1,
  descricao text NOT NULL,
  valor numeric NOT NULL CHECK (valor > 0),
  vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'recebida', 'cancelada')),
  recebida_em timestamptz,
  movimento_id uuid REFERENCES public.movimentos_financeiros(id) ON DELETE SET NULL,
  origem text NOT NULL DEFAULT 'contrato' CHECK (origem IN ('contrato', 'manual')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.contas_a_receber ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contas_a_receber' AND policyname = 'contas_a_receber_tenant_all') THEN
    CREATE POLICY contas_a_receber_tenant_all ON public.contas_a_receber
      FOR ALL TO authenticated
      USING (tenant_id = (SELECT auth.uid()))
      WITH CHECK (tenant_id = (SELECT auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_contas_a_receber_tenant_pend ON public.contas_a_receber (tenant_id, vencimento) WHERE deleted_at IS NULL AND status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_contas_a_receber_contrato ON public.contas_a_receber (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contas_a_receber_lead ON public.contas_a_receber (lead_id);
CREATE INDEX IF NOT EXISTS idx_contas_a_receber_movimento ON public.contas_a_receber (movimento_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_a_receber_contrato_parcela ON public.contas_a_receber (contrato_id, numero_parcela) WHERE contrato_id IS NOT NULL;

-- Contrato virou "assinado" → gera os recebíveis do plano ESCOLHIDO no aceite.
-- Blindada: falha de parse NUNCA aborta a assinatura (WARNING + segue).
CREATE OR REPLACE FUNCTION public.gerar_recebiveis_do_contrato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_forma jsonb;
  v_opcoes jsonb;
  v_opcao jsonb;
  v_parcelas integer;
  v_entrada numeric;
  v_valor_parcela numeric;
  v_total numeric;
  v_nome text;
  v_desc_base text;
  i integer;
BEGIN
  -- idempotente: já gerou pra este contrato → nada a fazer
  IF EXISTS (SELECT 1 FROM public.contas_a_receber WHERE contrato_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_nome := COALESCE(
      NEW.dados_signatario->>'nome_completo',
      NEW.dados_cliente->>'nome_completo',
      (SELECT l.name FROM public.leads l WHERE l.id = NEW.lead_id),
      'contato'
    );
    v_desc_base := COALESCE(NULLIF(NEW.titulo, ''), 'Contrato') || ' · ' || v_nome;

    v_forma := NEW.forma_pagamento_escolhida;
    v_opcoes := NEW.dados_pagamento->'planos'->'junto'->'opcoes';
    v_parcelas := COALESCE((v_forma->>'parcelas')::integer, 1);

    IF v_opcoes IS NOT NULL AND jsonb_typeof(v_opcoes) = 'array' THEN
      SELECT o INTO v_opcao FROM jsonb_array_elements(v_opcoes) o
      WHERE (o->>'parcelas')::integer = v_parcelas LIMIT 1;
    END IF;

    IF v_opcao IS NOT NULL THEN
      v_entrada := COALESCE((v_opcao->>'entrada_centavos')::numeric, 0) / 100;
      v_valor_parcela := COALESCE((v_opcao->>'valor_parcela_centavos')::numeric, 0) / 100;
    ELSE
      -- fallback: total à vista como recebível único
      v_entrada := 0;
      v_parcelas := 1;
      v_valor_parcela := COALESCE(
        (NEW.dados_pagamento->'planos'->'junto'->>'total_centavos')::numeric / 100,
        (NEW.dados_pagamento->>'total_avista')::numeric,
        0
      );
    END IF;

    IF v_entrada > 0 THEN
      INSERT INTO public.contas_a_receber (tenant_id, contrato_id, lead_id, numero_parcela, descricao, valor, vencimento)
      VALUES (NEW.tenant_id, NEW.id, NEW.lead_id, 0, 'Entrada · ' || v_desc_base, v_entrada, CURRENT_DATE);
    END IF;

    IF v_valor_parcela > 0 THEN
      FOR i IN 1..v_parcelas LOOP
        INSERT INTO public.contas_a_receber (tenant_id, contrato_id, lead_id, numero_parcela, descricao, valor, vencimento)
        VALUES (
          NEW.tenant_id, NEW.id, NEW.lead_id, i,
          'Parcela ' || i || '/' || v_parcelas || ' · ' || v_desc_base,
          v_valor_parcela,
          CURRENT_DATE + (i * 30)
        );
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'gerar_recebiveis_do_contrato falhou pro contrato %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_recebiveis_contrato ON public.contratos;
CREATE TRIGGER trg_gerar_recebiveis_contrato
  AFTER UPDATE OF status ON public.contratos
  FOR EACH ROW
  WHEN (NEW.status = 'assinado' AND OLD.status IS DISTINCT FROM 'assinado')
  EXECUTE FUNCTION public.gerar_recebiveis_do_contrato();
;

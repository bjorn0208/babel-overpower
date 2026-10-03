CREATE OR REPLACE FUNCTION public.resolver_cupom_ativo(
  p_tenant_id uuid, p_codigo text
) RETURNS TABLE (campanha_id uuid, comissao_tipo text, comissao_valor numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.comissao_tipo, c.comissao_valor
  FROM public.indicacao_campanhas c
  WHERE c.tenant_id = p_tenant_id
    AND lower(c.cupom) = lower(p_codigo)
    AND c.status = 'ativa'
    AND c.deleted_at IS NULL
    AND CURRENT_DATE BETWEEN c.data_inicio AND c.data_fim
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_cupom_ativo(uuid, text) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.gerar_comissao_indicacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_campanha record;
  v_base_valor numeric;
  v_valor_comissao numeric;
BEGIN
  IF NEW.converted_at IS NULL OR OLD.converted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.indicacao_campanha_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, comissao_tipo, comissao_valor, status INTO v_campanha
  FROM public.indicacao_campanhas WHERE id = NEW.indicacao_campanha_id;

  IF NOT FOUND OR v_campanha.status <> 'ativa' THEN RETURN NEW; END IF;

  v_base_valor := COALESCE(NEW.total_debt, 0);

  IF v_campanha.comissao_tipo = 'percentual' THEN
    v_valor_comissao := ROUND((v_base_valor * v_campanha.comissao_valor / 100)::numeric, 2);
  ELSE
    v_valor_comissao := v_campanha.comissao_valor;
  END IF;

  INSERT INTO public.indicacao_comissoes (
    tenant_id, campanha_id, lead_id, base_valor, valor_comissao,
    comissao_tipo, comissao_valor_congelado
  ) VALUES (
    NEW.tenant_id, v_campanha.id, NEW.id, v_base_valor, v_valor_comissao,
    v_campanha.comissao_tipo, v_campanha.comissao_valor
  )
  ON CONFLICT (lead_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_comissao_indicacao ON public.leads;
CREATE TRIGGER trg_gerar_comissao_indicacao
AFTER UPDATE OF converted_at ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.gerar_comissao_indicacao();
;

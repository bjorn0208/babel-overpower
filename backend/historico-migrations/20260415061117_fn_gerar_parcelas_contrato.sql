CREATE OR REPLACE FUNCTION public.fn_gerar_parcelas_contrato(p_contract_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_opts jsonb;
  v_inseridos integer := 0;
  v_existentes integer;
  v_hoje date := now()::date;
  v_inst jsonb;
  v_entrada numeric;
  v_parcelas integer;
  v_valor_parcela numeric;
  v_valor_a_vista numeric;
  i integer;
BEGIN
  SELECT COUNT(*) INTO v_existentes FROM public.client_payments WHERE contract_id = p_contract_id;
  IF v_existentes > 0 THEN RETURN 0; END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND OR v_contract.tenant_id IS NULL OR v_contract.lead_id IS NULL THEN
    RETURN 0;
  END IF;

  v_opts := COALESCE(v_contract.payment_options, '{}'::jsonb);

  IF (v_opts->>'parcelado')::boolean IS TRUE
     AND jsonb_typeof(v_opts->'installment_options') = 'array'
     AND jsonb_array_length(v_opts->'installment_options') > 0
  THEN
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_opts->'installment_options') LOOP
      v_entrada := COALESCE((v_inst->>'entrada')::numeric, 0);
      v_parcelas := COALESCE((v_inst->>'parcelas')::integer, 0);
      v_valor_parcela := COALESCE((v_inst->>'valor_parcela')::numeric, 0);
      IF v_parcelas > 0 AND v_valor_parcela > 0 THEN
        IF v_entrada > 0 THEN
          INSERT INTO public.client_payments (tenant_id, lead_id, contract_id, descricao, valor, data_vencimento, status)
          VALUES (v_contract.tenant_id, v_contract.lead_id, p_contract_id, 'Entrada', v_entrada, v_hoje, 'pendente');
          v_inseridos := v_inseridos + 1;
        END IF;
        FOR i IN 1..v_parcelas LOOP
          INSERT INTO public.client_payments (tenant_id, lead_id, contract_id, descricao, valor, data_vencimento, status)
          VALUES (v_contract.tenant_id, v_contract.lead_id, p_contract_id, 'Parcela ' || i || '/' || v_parcelas, v_valor_parcela, v_hoje + (i * 30), 'pendente');
          v_inseridos := v_inseridos + 1;
        END LOOP;
      END IF;
    END LOOP;
    IF v_inseridos > 0 THEN RETURN v_inseridos; END IF;
  END IF;

  IF (v_opts->>'parcelado')::boolean IS TRUE
     AND COALESCE((v_opts->>'num_parcelas')::integer, 0) > 0
     AND COALESCE((v_opts->>'valor_parcela')::numeric, 0) > 0
  THEN
    v_entrada := COALESCE((v_opts->>'valor_entrada')::numeric, 0);
    v_parcelas := COALESCE((v_opts->>'num_parcelas')::integer, 0);
    v_valor_parcela := COALESCE((v_opts->>'valor_parcela')::numeric, 0);
    IF v_entrada > 0 THEN
      INSERT INTO public.client_payments (tenant_id, lead_id, contract_id, descricao, valor, data_vencimento, status)
      VALUES (v_contract.tenant_id, v_contract.lead_id, p_contract_id, 'Entrada', v_entrada, v_hoje, 'pendente');
      v_inseridos := v_inseridos + 1;
    END IF;
    FOR i IN 1..v_parcelas LOOP
      INSERT INTO public.client_payments (tenant_id, lead_id, contract_id, descricao, valor, data_vencimento, status)
      VALUES (v_contract.tenant_id, v_contract.lead_id, p_contract_id, 'Parcela ' || i || '/' || v_parcelas, v_valor_parcela, v_hoje + (i * 30), 'pendente');
      v_inseridos := v_inseridos + 1;
    END LOOP;
    IF v_inseridos > 0 THEN RETURN v_inseridos; END IF;
  END IF;

  IF (v_opts->>'a_vista')::boolean IS TRUE THEN
    v_valor_a_vista := COALESCE((v_opts->>'valor_a_vista')::numeric, (v_opts->>'preco')::numeric, 0);
    IF v_valor_a_vista > 0 THEN
      INSERT INTO public.client_payments (tenant_id, lead_id, contract_id, descricao, valor, data_vencimento, status)
      VALUES (v_contract.tenant_id, v_contract.lead_id, p_contract_id, 'À vista', v_valor_a_vista, v_hoje, 'pendente');
      RETURN 1;
    END IF;
  END IF;

  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_gerar_parcelas_contrato(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.trg_gerar_parcelas_on_sign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.signed_at IS NOT NULL
     AND (OLD.signed_at IS NULL OR OLD.signed_at IS DISTINCT FROM NEW.signed_at)
  THEN
    PERFORM public.fn_gerar_parcelas_contrato(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_parcelas_on_sign ON public.contracts;
CREATE TRIGGER trg_gerar_parcelas_on_sign
  AFTER UPDATE OF signed_at ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_gerar_parcelas_on_sign();
;

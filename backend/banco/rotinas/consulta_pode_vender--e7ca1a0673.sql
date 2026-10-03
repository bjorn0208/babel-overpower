CREATE OR REPLACE FUNCTION public.consulta_pode_vender(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid := public.tenant_efetivo(p_tenant_id);
  v_exige_instalacao boolean;
  v_instalado boolean;
  v_toggle boolean;
  v_tipo_padrao uuid;
  v_saldo numeric(10,2);
  v_custo_ref numeric(10,2);
BEGIN
  IF v_tenant IS NULL THEN
    RETURN false;
  END IF;

  -- Portão 1: instalação. App só exige instalação se estiver no catálogo ativo da loja.
  SELECT EXISTS (
    SELECT 1 FROM public.loja_aplicativos
    WHERE slug = 'consulta' AND is_active = true
  ) INTO v_exige_instalacao;

  IF v_exige_instalacao THEN
    SELECT EXISTS (
      SELECT 1 FROM public.aplicativos_instalados
      WHERE user_id = v_tenant AND aplicativo_slug = 'consulta'
    ) INTO v_instalado;
    IF NOT v_instalado THEN
      RETURN false;
    END IF;
  END IF;

  -- Portão 2: toggle ligado (+ captura o tipo padrão pra régua de saldo)
  SELECT agente_pode_vender, tipo_padrao_id
    INTO v_toggle, v_tipo_padrao
  FROM public.consultas_config_tenant
  WHERE tenant_id = v_tenant;

  IF COALESCE(v_toggle, false) = false THEN
    RETURN false;
  END IF;

  -- Portão 3: saldo >= custo de 1 consulta
  SELECT COALESCE(saldo, 0) INTO v_saldo
  FROM public.consultas_saldo
  WHERE tenant_id = v_tenant;
  v_saldo := COALESCE(v_saldo, 0);

  v_custo_ref := (
    SELECT custo FROM public.consultas_tipos
    WHERE id = v_tipo_padrao AND ativo = true AND deleted_at IS NULL
  );
  IF v_custo_ref IS NULL THEN
    v_custo_ref := (
      SELECT MIN(custo) FROM public.consultas_tipos
      WHERE ativo = true AND deleted_at IS NULL
    );
  END IF;

  IF v_custo_ref IS NULL OR v_saldo < v_custo_ref THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$


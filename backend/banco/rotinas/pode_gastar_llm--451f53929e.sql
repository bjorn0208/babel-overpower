CREATE OR REPLACE FUNCTION public.pode_gastar_llm(p_tenant_id uuid, p_teto_padrao_usd numeric DEFAULT 5.00)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_teto   numeric := p_teto_padrao_usd;
  v_aviso  smallint := 80;
  v_corte  smallint := 100;
  v_ativo  boolean := true;
  v_gasto  numeric;
  v_pct    numeric;
  v_modo   text;
begin
  select teto_mensal_usd, aviso_pct, corte_pct, ativo
    into v_teto, v_aviso, v_corte, v_ativo
    from public.orcamento_llm_tenant where tenant_id = p_tenant_id;
  if not found then
    v_teto := p_teto_padrao_usd;
  end if;
  v_gasto := public.custo_llm_tenant_mes(p_tenant_id);
  v_pct := case when v_teto > 0 then round((v_gasto / v_teto) * 100, 1) else 0 end;
  v_modo := case
    when not v_ativo or v_teto <= 0 then 'normal'
    when v_pct >= v_corte then 'bloqueado'
    when v_pct >= v_aviso then 'economico'
    else 'normal' end;
  return jsonb_build_object('ok', true, 'modo', v_modo, 'gasto_usd', round(v_gasto, 4),
                            'teto_usd', v_teto, 'pct', v_pct);
end;
$function$


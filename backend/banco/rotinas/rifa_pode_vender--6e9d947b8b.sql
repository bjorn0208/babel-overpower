CREATE OR REPLACE FUNCTION public.rifa_pode_vender(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid := public.tenant_efetivo(p_tenant_id);
  v_exige_instalacao boolean;
  v_instalado boolean;
  v_toggle boolean;
begin
  if v_tenant is null then return false; end if;

  select exists (
    select 1 from public.loja_aplicativos where slug = 'rifas' and is_active = true
  ) into v_exige_instalacao;

  if v_exige_instalacao then
    select exists (
      select 1 from public.aplicativos_instalados
      where user_id = v_tenant and aplicativo_slug = 'rifas'
    ) into v_instalado;
    if not v_instalado then return false; end if;
  end if;

  select agente_pode_vender into v_toggle
  from public.rifas_config_tenant where tenant_id = v_tenant;

  return coalesce(v_toggle, true);
end;
$function$


CREATE OR REPLACE FUNCTION public.rifa_app_instalado(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid := public.tenant_efetivo(p_tenant_id);
  v_exige_instalacao boolean;
  v_instalado boolean;
begin
  if v_tenant is null then return false; end if;

  select exists (
    select 1 from public.loja_aplicativos where slug = 'rifas' and is_active = true
  ) into v_exige_instalacao;

  -- App fora da loja (desligado globalmente) = ninguém precisa instalar pra ter.
  -- Mesmo comportamento de `rifa_pode_vender`, de propósito.
  if not v_exige_instalacao then return true; end if;

  select exists (
    select 1 from public.aplicativos_instalados
    where user_id = v_tenant and aplicativo_slug = 'rifas'
  ) into v_instalado;

  return v_instalado;
end;
$function$


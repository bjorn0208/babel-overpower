-- Catraca do canal INTERNO do app Rifas (Theus, 2026-09-07).
--
-- Por que existe: o Bricio (agente do dono dentro do app Rifas) estava pendurado em
-- `rifa_pode_vender`, que é a catraca do agente EXTERNO vendendo pro lead no WhatsApp —
-- ela exige app instalado E o toggle `agente_pode_vender`. Com o toggle desligado, o
-- dono ficava cego no próprio painel: a aba Bricio caía pro Mentor em silêncio e as
-- tools de rifa carregavam vazias. O Bricio nunca rodou um turno por causa disso.
--
-- `agente_pode_vender` governa o agente falando com o LEAD. Canal do DONO só precisa
-- saber se o app está instalado.
--
-- `rifa_pode_vender` fica INTOCADA — o caminho externo (`tools-rifas.ts` catracaLiberada,
-- `apps-agente.ts`) continua exigindo o toggle.
create or replace function public.rifa_app_instalado(p_tenant_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_tenant uuid := coalesce(p_tenant_id, (select auth.uid()));
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
$function$;

revoke all on function public.rifa_app_instalado(uuid) from public;
grant execute on function public.rifa_app_instalado(uuid) to authenticated, service_role;

comment on function public.rifa_app_instalado(uuid) is
  'Catraca do canal INTERNO do app Rifas (Bricio + Mentor do dono): só exige o app instalado. Diferente de rifa_pode_vender, que é a catraca do agente EXTERNO e exige também o toggle agente_pode_vender.';
;

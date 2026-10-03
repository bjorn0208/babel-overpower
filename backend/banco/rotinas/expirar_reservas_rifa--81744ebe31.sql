CREATE OR REPLACE FUNCTION public.expirar_reservas_rifa()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_qtd integer;
begin
  with vencidos as (
    select id from public.pedidos_rifa
    where status = 'reservado' and expira_em is not null and expira_em < now()
  ), del as (
    delete from public.numeros_rifa
    where pedido_id in (select id from vencidos)
  )
  update public.pedidos_rifa
  set status = 'expirado', updated_at = now()
  where id in (select id from vencidos);
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$function$


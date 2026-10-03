CREATE OR REPLACE FUNCTION public.evocar_memoria_dono(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  update public.memoria_dono
     set vezes_evocado = vezes_evocado + 1, ultima_evocacao_em = now()
   where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end;
$function$


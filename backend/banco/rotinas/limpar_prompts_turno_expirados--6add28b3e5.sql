CREATE OR REPLACE FUNCTION public.limpar_prompts_turno_expirados()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_dias    integer;
  v_apagados integer;
begin
  select coalesce(max(retencao_prompts_turno_dias), 90) into v_dias
  from public.config_plataforma;

  delete from public.prompts_turno
  where criado_em < now() - (v_dias || ' days')::interval;

  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$function$


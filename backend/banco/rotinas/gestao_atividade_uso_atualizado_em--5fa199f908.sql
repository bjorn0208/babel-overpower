CREATE OR REPLACE FUNCTION public.gestao_atividade_uso_atualizado_em()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v timestamptz;
begin
  if not public.gestao_tem_papel(array['financeiro']::text[]) then raise exception 'gestao: sem permissao para a atividade' using errcode = '42501'; end if;
  select max(k.atualizado_em) into v from public.gestao_atividade_uso_mes k;
  return v;
end $function$


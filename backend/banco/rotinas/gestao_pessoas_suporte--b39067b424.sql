CREATE OR REPLACE FUNCTION public.gestao_pessoas_suporte()
 RETURNS TABLE(nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.gestao_tem_algum_papel() then
    raise exception 'gestao: sem permissão para listar a equipe' using errcode = '42501';
  end if;
  return query select distinct btrim(a.pessoa) from public.gestao_acessos a
   where a.deleted_at is null and a.papeis && array['suporte']::text[] and length(btrim(coalesce(a.pessoa, ''))) > 0
   order by 1;
end $function$


CREATE OR REPLACE FUNCTION public.gestao_chamado_clientes()
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.gestao_tem_papel(array['suporte']::text[]) then
    raise exception 'gestao: sem permissão para listar clientes' using errcode = '42501';
  end if;
  return query select c.id, c.nome from public.gestao_clientes c where c.deleted_at is null order by c.nome;
end $function$


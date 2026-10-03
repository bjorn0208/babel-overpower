CREATE OR REPLACE FUNCTION public.gestao_definir_suporte_cliente(p_cliente_id uuid, p_nome text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.gestao_tem_papel(array['suporte','implementacao']::text[]) then
    raise exception 'gestao: sem permissao para definir o suporte do cliente' using errcode = '42501'; end if;
  if p_cliente_id is null or (p_nome is not null and length(p_nome) > 120) then
    raise exception 'gestao: parametros invalidos' using errcode = '22023'; end if;
  update public.gestao_clientes set suporte = nullif(btrim(coalesce(p_nome, '')), '') where id = p_cliente_id and deleted_at is null;
  if not found then raise exception 'gestao: cliente nao encontrado' using errcode = '22023'; end if;
end $function$


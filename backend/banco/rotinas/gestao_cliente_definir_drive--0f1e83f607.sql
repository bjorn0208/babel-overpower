CREATE OR REPLACE FUNCTION public.gestao_cliente_definir_drive(p_cliente_id uuid, p_link text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if not public.gestao_tem_papel(array['programador','implementacao']::text[]) then
    raise exception 'gestao: sem permissão para editar o link do Drive' using errcode = '42501';
  end if;
  if v_link is not null and (v_link !~ '^https://[^[:space:]]+$' or length(v_link) > 500) then
    raise exception 'gestao: o link precisa começar com https:// (até 500 caracteres, sem espaços)' using errcode = '22023';
  end if;
  update public.gestao_clientes set link_drive = v_link where id = p_cliente_id and deleted_at is null;
  if not found then raise exception 'gestao: cliente não encontrado' using errcode = '22023'; end if;
end $function$


CREATE OR REPLACE FUNCTION public.gestao_chamado_ficha(p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- 25/09 (Adrian): implementação e P&D abrem a ficha de qualquer cliente para editar o link do Drive; os chamados dentro
  -- dela continuam filtrados pela RLS (P&D só os escalados, implementação nenhum).
  if not public.gestao_tem_papel(array['suporte','financeiro','comercial','programador','implementacao']::text[]) then
    raise exception 'gestao: sem permissão para ver a ficha deste cliente' using errcode = '42501';
  end if;
  return public.gestao_chamado_ficha_interna(p_cliente_id);
end $function$


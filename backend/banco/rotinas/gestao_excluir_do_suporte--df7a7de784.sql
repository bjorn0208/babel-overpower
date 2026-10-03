CREATE OR REPLACE FUNCTION public.gestao_excluir_do_suporte(p_impl_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.gestao_tem_papel(array['suporte','implementacao']::text[]) then
    raise exception 'gestao: sem permissao para excluir do suporte' using errcode = '42501'; end if;
  update public.gestao_implementacoes set suporte_removido = true
   where id = p_impl_id and deleted_at is null and status = 'concluida';
  if not found then raise exception 'gestao: implementacao nao encontrada ou ainda nao concluida' using errcode = '22023'; end if;
end $function$


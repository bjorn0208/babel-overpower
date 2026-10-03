CREATE OR REPLACE FUNCTION public.gestao_atribuir_suporte(p_impl_id uuid, p_nome text, p_indice integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_impl record; v_equipe jsonb;
begin
  if not public.gestao_tem_papel(array['implementacao']::text[]) then raise exception 'gestao: sem permissao para atribuir suporte' using errcode = '42501'; end if;
  if p_impl_id is null or p_nome is null or btrim(p_nome) = '' or length(p_nome) > 120 or p_indice is null or p_indice < 0 or p_indice > 1000 then
    raise exception 'gestao: parametros invalidos' using errcode = '22023'; end if;
  select * into v_impl from public.gestao_implementacoes where id = p_impl_id and deleted_at is null;
  if not found or v_impl.status is distinct from 'concluida' or v_impl.suporte_responsavel is distinct from p_nome then
    raise exception 'gestao: a implementacao precisa estar concluida e com este responsavel de suporte' using errcode = '22023'; end if;
  select valor -> 'pessoas' into v_equipe from public.gestao_config where chave = 'equipe' and deleted_at is null;
  if v_equipe is not null and jsonb_typeof(v_equipe) = 'array' and jsonb_array_length(v_equipe) > 0 and not (v_equipe @> to_jsonb(p_nome)) then
    raise exception 'gestao: % nao esta na equipe de suporte', p_nome using errcode = '22023'; end if;
  insert into public.gestao_config (chave, valor) values ('rodizioSuporte', jsonb_build_object('indice', p_indice, 'nome', p_nome, 'em', now()))
    on conflict (chave) do update set valor = excluded.valor, deleted_at = null;
  if v_impl.cliente_id is not null then update public.gestao_clientes set suporte = p_nome where id = v_impl.cliente_id; end if;
end $function$


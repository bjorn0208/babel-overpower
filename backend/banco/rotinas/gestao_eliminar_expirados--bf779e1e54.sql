CREATE OR REPLACE FUNCTION public.gestao_eliminar_expirados(p_executar boolean DEFAULT false)
 RETURNS TABLE(tabela text, linhas bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_anos integer; v_corte timestamptz; t text; n bigint;
begin
  if not public.gestao_eh_admin() then raise exception 'gestao: so o admin elimina dados expirados' using errcode = '42501'; end if;
  select case when (valor ->> 'anos') ~ '^[0-9]{1,2}$' then (valor ->> 'anos')::integer end into v_anos from public.gestao_config where chave = 'retencao' and deleted_at is null;
  v_anos := coalesce(v_anos, 5);
  if v_anos < 1 then raise exception 'gestao: retencao invalida' using errcode = '22023'; end if;
  v_corte := now() - make_interval(years => v_anos);
  foreach t in array array['gestao_vendas', 'gestao_indicacoes'] loop
    if p_executar then execute format('with d as (delete from public.%I where criado_em < $1 returning 1) select count(*) from d', t) into n using v_corte;
    else execute format('select count(*) from public.%I where criado_em < $1', t) into n using v_corte; end if;
    tabela := t; linhas := n; return next;
  end loop;
end $function$


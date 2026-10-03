-- Esquema passa a dizer quais tabelas aceitam escrita (tool atualizar_dados).
set lock_timeout = '2s';
set statement_timeout = '30s';

create or replace function public.esquema_consulta_dados()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      t.tabela,
      jsonb_build_object('descricao', t.descricao, 'aceita_escrita', t.permite_escrita, 'colunas', t.colunas)
    ),
    '{}'::jsonb
  )
  from (
    select p.tabela,
           p.descricao,
           p.permite_escrita,
           (
             select jsonb_agg(c.column_name || ' ' || c.data_type order by c.ordinal_position)
             from information_schema.columns c
             where c.table_schema = 'public' and c.table_name = p.tabela
           ) as colunas
    from public.tabelas_consulta_permitidas p
    where p.ativo
  ) t;
$$;

revoke all on function public.esquema_consulta_dados() from public;
revoke all on function public.esquema_consulta_dados() from anon;
revoke all on function public.esquema_consulta_dados() from authenticated;
grant execute on function public.esquema_consulta_dados() to service_role;
;

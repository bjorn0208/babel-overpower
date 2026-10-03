-- Erro que ensina: quando a LLM escreve um UPDATE citando coluna que não
-- existe (aconteceu com embedding_status em produto_conhecimento), o handler
-- devolve as colunas REAIS da tabela pra ela se corrigir no mesmo turno.
-- Só tabelas da allowlist de consulta; service_role only.

set lock_timeout = '2s';
set statement_timeout = '30s';

create or replace function public.colunas_da_tabela(p_tabela text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(c.column_name || ' ' || c.data_type order by c.ordinal_position),
    '[]'::jsonb
  )
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = lower(btrim(coalesce(p_tabela, '')))
    and exists (
      select 1 from public.tabelas_consulta_permitidas t
      where t.tabela = lower(btrim(coalesce(p_tabela, ''))) and t.ativo
    );
$$;

revoke all on function public.colunas_da_tabela(text) from public, anon, authenticated;
grant execute on function public.colunas_da_tabela(text) to service_role;
;

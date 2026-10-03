-- Conferência pós-carga (esperados do INSTALAR-BANCO-NOVO.md, medidos no banco novo em 29/09)
select 'tabelas public (esperado 295)' as item,
       count(*)::text as valor
  from pg_tables where schemaname = 'public'
union all
select 'views public (esperado 23)',
       count(*)::text
  from pg_views where schemaname = 'public'
union all
select 'tables+views information_schema (esperado 318)',
       count(*)::text
  from information_schema.tables where table_schema = 'public'
union all
select 'policies total (esperado 758-760)',
       count(*)::text
  from pg_policies
union all
select 'funcoes public (esperado 452)',
       count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
union all
select 'tabelas public com RLS',
       count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
union all
select 'extensoes exigidas presentes (esperado 13)',
       count(*)::text
  from pg_extension
 where extname in ('pg_cron','pg_net','citext','hypopg','moddatetime','pg_stat_statements',
                   'pg_trgm','pgcrypto','pgmq','supabase_vault','unaccent','uuid-ossp','vector')
union all
select 'cron.job agendados (esperado 0 local)',
       count(*)::text
  from cron.job
union all
select 'triggers em auth.users',
       count(*)::text
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal
union all
select 'refs a producao em funcoes (esperado 0)',
       count(*)::text
  from pg_proc where prosrc like '%pdamarjxcmkzbhqxtapl%';

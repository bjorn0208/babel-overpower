-- Roda ANTES do schema-local.sql, como postgres, num banco recém-resetado.
-- 1) Zera os default privileges do postgres em public/storage: o pg_dump grava ACLs
--    relativas ao acldefault() do Postgres, não aos default privileges do destino.
--    Sem isto, todo objeto restaurado herda grants a anon/authenticated que a produção
--    revogou. A seção DEFAULT ACL no fim do dump recria os defaults da produção.
-- 2) Cria o role customizado da produção (igual a historico-migrations/
--    20260801142259_consultar_dados_role_dedicado_completo.sql), para os
--    ALTER FUNCTION ... OWNER TO consultor_dados_ro do dump funcionarem.
begin;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema storage
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema storage
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema storage
  revoke all on functions from anon, authenticated, service_role;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'consultor_dados_ro') then
    create role consultor_dados_ro nologin;
  end if;
end $$;
grant authenticated to consultor_dados_ro;
grant consultor_dados_ro to postgres;
-- CREATE temporário: ALTER OWNER exige que o novo dono possa criar no schema.
-- Revogado no pos-carga.sql, como nas migrations originais.
grant usage, create on schema public to consultor_dados_ro;

commit;

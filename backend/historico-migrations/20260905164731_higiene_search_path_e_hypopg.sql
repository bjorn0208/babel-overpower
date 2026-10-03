-- Auditoria 2026-09-05, dois achados do advisor de segurança.

-- 1) `set_atualizado_em` estava sem `SET search_path` — viola regra inviolável do
--    CLAUDE.md e deixa a função (usada por 11 triggers) sujeita a captura de
--    search_path. Corpo só usa now() (pg_catalog, sempre implícito), então
--    search_path = '' é seguro.
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.atualizado_em = now();
  return new;
end $function$;

-- 2) Extensão hypopg estava instalada em `public`. O search_path do banco e do
--    role postgres já é '"$user", public, extensions', então o índice-advisor do
--    Postgres MCP continua achando hypopg_create_index sem qualificar.
alter extension hypopg set schema extensions;
;

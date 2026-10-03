-- Correção da migration anterior (revoga_anon_salvar_resultados_turno), que foi
-- incompleta: revoguei de anon e authenticated, mas a ACL era `=X/postgres` — o `=`
-- sem papel é PUBLIC, e anon/authenticated herdam dele. O EXECUTE continuou valendo.
--
-- Lição pra qualquer revoke futuro: em função, o default do Postgres é EXECUTE pra
-- PUBLIC. Revogar só dos papéis nominais não fecha nada. Tem que revogar de PUBLIC —
-- foi o que as migrations 20260904150000/160000/161000 fizeram certo
-- (`REVOKE ... FROM PUBLIC, anon`) e eu não repeti.
--
-- Verificação depois de aplicar: has_function_privilege('anon', ..., 'EXECUTE') = false
-- e a ACL não pode mais conter uma entrada começando em `=`.

revoke execute on function public.salvar_resultados_turno(
  uuid, uuid, text, text[], integer, text, jsonb, text, text[], uuid, text,
  integer, integer, numeric, integer, text, text, jsonb, jsonb, uuid, boolean
) from public;

grant execute on function public.salvar_resultados_turno(
  uuid, uuid, text, text[], integer, text, jsonb, text, text[], uuid, text,
  integer, integer, numeric, integer, text, text, jsonb, jsonb, uuid, boolean
) to service_role;
;

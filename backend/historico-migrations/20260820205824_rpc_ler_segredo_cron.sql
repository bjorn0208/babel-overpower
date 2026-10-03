-- Helper das cron-edges: devolve o segredo que o pg_cron envia no Bearer
-- (vault service_role_key). Execução restrita a service_role — a edge chama
-- com o próprio client de serviço pra validar o Bearer recebido por igualdade.
create or replace function public.ler_segredo_cron()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1
$$;

revoke all on function public.ler_segredo_cron() from public;
revoke all on function public.ler_segredo_cron() from anon;
revoke all on function public.ler_segredo_cron() from authenticated;
grant execute on function public.ler_segredo_cron() to service_role;
;

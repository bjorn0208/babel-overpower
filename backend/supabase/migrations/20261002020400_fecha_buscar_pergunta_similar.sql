-- Segurança (AUDITORIA-BACK B-03): buscar_pergunta_similar é SECURITY DEFINER (ignora RLS),
-- não confere quem chama e estava executável por anon: com o tenant_id de qualquer cliente
-- e um vetor qualquer devolvia perguntas e respostas do dono daquele tenant.
-- Único chamador: _shared/loop-mentor.ts nas edges do motor (ragentic-processar-inline,
-- ragentic-tick, webhook, extrair-fatos-lead, cron-lembretes-financeiro), que usam o
-- cliente service_role. Front não chama. Idempotente.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'buscar_pergunta_similar'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

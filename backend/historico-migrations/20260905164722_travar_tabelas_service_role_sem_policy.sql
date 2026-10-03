-- Auditoria 2026-09-05: 4 tabelas com RLS ligado e ZERO policy.
-- Não é vazamento (RLS sem policy = nega tudo, menos service_role), mas o GRANT
-- amplo pra anon/authenticated ficou de herança e esconde a intenção real: essas
-- 4 são de uso exclusivo de edge/cron via service_role.
-- Revogar o grant não muda comportamento (RLS já barrava) — só torna a decisão
-- explícita no schema em vez de depender do RLS como única trava.
-- Nenhum código em supabase/functions nem frontend/src lê essas tabelas (conferido).

revoke all on public.conexoes_google from anon, authenticated;
revoke all on public.google_oauth_estados_usados from anon, authenticated;
revoke all on public.registro_purge from anon, authenticated;
revoke all on public.mentor_tag_regras from anon, authenticated;

comment on table public.conexoes_google is
  'Refresh token do Google por tenant. Exclusiva de service_role (edges google-*). RLS sem policy é proposital: nem anon nem authenticated podem tocar. Nunca expor refresh_token ao cliente.';
comment on table public.google_oauth_estados_usados is
  'Anti-replay do state do OAuth Google. Exclusiva de service_role (edge google-oauth-retorno). RLS sem policy é proposital.';
comment on table public.registro_purge is
  'Auditoria do cron purgar-soft-delete. Exclusiva de service_role. RLS sem policy é proposital.';
comment on table public.mentor_tag_regras is
  'Regras de tag do Mentor lidas por edge. Exclusiva de service_role. RLS sem policy é proposital.';
;

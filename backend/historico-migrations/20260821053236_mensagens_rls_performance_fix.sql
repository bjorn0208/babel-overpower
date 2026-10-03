-- Fix 57014 (statement timeout) nas contagens de mensagens — 2026-08-21.
-- Causa: user_read_messages fazia JOIN conversas×agentes com LIKE composto por
-- LINHA (inplanejável); eh_admin_plataforma() sem (select) reavaliava por linha.

-- 1) admin: initplan único em vez de chamada por linha
drop policy if exists "admin_read_messages" on public.mensagens;
create policy "admin_read_messages" on public.mensagens
  for select to authenticated
  using ((select public.eh_admin_plataforma()));

drop policy if exists "admin_insert_messages" on public.mensagens;
create policy "admin_insert_messages" on public.mensagens
  for insert to authenticated
  with check ((select public.eh_admin_plataforma()));

-- 2) chat-test legado: só olha conversas 'chat-test-%' (poucas) e casa o agente
--    por igualdade extraída do phone (uuid tem 36 chars após o prefixo) em vez
--    do LIKE composto sobre o produto cartesiano.
drop policy if exists "user_read_messages" on public.mensagens;
create policy "user_read_messages" on public.mensagens
  for select to authenticated
  using (
    exists (
      select 1
      from public.conversas c
      join public.agentes ua on ua.id::text = substring(c.phone from 11 for 36)
      where c.id = mensagens.conversation_id
        and c.phone like 'chat-test-%'
        and (
          ua.user_id = (select auth.uid())
          or exists (
            select 1 from public.profiles
            where profiles.id = (select auth.uid())
              and profiles.parent_user_id = ua.user_id
          )
        )
    )
  );
;

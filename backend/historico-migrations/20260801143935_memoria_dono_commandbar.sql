-- Tijolo 3 · CommandBar "ChatGPT da empresa" — memória evolutiva do dono.
-- Espelho simples do cano memoria_lead pro DONO do tenant: fatos duráveis
-- extraídos das conversas do commandbar (canal interno), recall por recência.
-- V1 sem vetor semântico (entra depois se precisar).

set lock_timeout = '2s';
set statement_timeout = '30s';

create table if not exists public.memoria_dono (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  fato text not null,
  categoria text not null default 'geral',
  origem_conversa_id uuid references public.mentor_conversas (id) on delete set null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Anti-duplicata exata por dono (md5 pra não indexar texto longo inteiro).
create unique index if not exists memoria_dono_owner_fato_unico
  on public.memoria_dono (owner_id, md5(fato));

-- Recall por recência (só ativas) + FK indexes.
create index if not exists idx_memoria_dono_owner_recencia
  on public.memoria_dono (owner_id, atualizado_em desc) where ativa;
create index if not exists idx_memoria_dono_origem_conversa
  on public.memoria_dono (origem_conversa_id);

alter table public.memoria_dono enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'memoria_dono' and policyname = 'dono_gerencia_propria_memoria'
  ) then
    create policy "dono_gerencia_propria_memoria" on public.memoria_dono
      for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;
end $$;
;

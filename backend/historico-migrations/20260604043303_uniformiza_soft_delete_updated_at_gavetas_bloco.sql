-- Uniformiza as 7 gavetas de bloco com schema antigo (só criado_em):
-- adiciona updated_at + deleted_at + trigger moddatetime + backfill.
-- Alinha com as outras 7 gavetas (created_at/updated_at/deleted_at) pra
-- destravar a listagem/ordenacao/soft-delete da aba Blocos da Curadoria.
do $$
declare
  t text;
  nome_trigger text;
  tabelas text[] := array[
    'acao_pausa_blocos','anti_padroes','diretriz_bolha_blocos',
    'emocao_blocos','manipulacao_blocos','prova_social_blocos',
    'regras_operacionais_blocos'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('update public.%I set updated_at = coalesce(updated_at, criado_em, now()) where updated_at is null', t);
    execute format('alter table public.%I alter column updated_at set default now()', t);
    nome_trigger := 'trg_' || t || '_updated_at';
    execute format('drop trigger if exists %I on public.%I', nome_trigger, t);
    execute format('create trigger %I before update on public.%I for each row execute function extensions.moddatetime(updated_at)', nome_trigger, t);
  end loop;
end $$;
;

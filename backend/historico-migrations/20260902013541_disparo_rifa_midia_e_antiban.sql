alter table public.rifa_agendamentos_disparo
  add column if not exists midia_url text,
  add column if not exists descanso_min_segundos integer not null default 20,
  add column if not exists descanso_max_segundos integer not null default 90,
  add column if not exists limite_diario integer,
  add column if not exists janela_inicio time,
  add column if not exists janela_fim time;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rifa_agendamentos_disparo_descanso_check'
  ) then
    alter table public.rifa_agendamentos_disparo
      add constraint rifa_agendamentos_disparo_descanso_check
      check (descanso_min_segundos >= 0 and descanso_max_segundos >= descanso_min_segundos);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'rifa_agendamentos_disparo_limite_diario_check'
  ) then
    alter table public.rifa_agendamentos_disparo
      add constraint rifa_agendamentos_disparo_limite_diario_check
      check (limite_diario is null or limite_diario > 0);
  end if;
end $$;

;

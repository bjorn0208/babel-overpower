-- Aviso de lotação do app Reunião (gerido pelo app Admin Reuniões).
-- up
alter table public.config_plataforma
  add column if not exists reuniao_aviso_ativo boolean not null default false;
alter table public.config_plataforma
  add column if not exists reuniao_aviso_limiar integer not null default 40;
comment on column public.config_plataforma.reuniao_aviso_ativo is 'Aviso de lotação da Reunião ligado/desligado (app Admin Reuniões)';
comment on column public.config_plataforma.reuniao_aviso_limiar is 'Participantes simultâneos na plataforma (todas as salas do LiveKit) que disparam o aviso';
-- down (rollback): alter table public.config_plataforma drop column if exists reuniao_aviso_ativo; alter table public.config_plataforma drop column if exists reuniao_aviso_limiar;
;

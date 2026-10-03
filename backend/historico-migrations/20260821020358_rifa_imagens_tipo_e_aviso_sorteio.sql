-- Dois tipos de imagem da rifa (2026-08-20): cartela (atualizações do Status,
-- gerada pelo cron com os números vendidos preenchidos) × divulgacao (arte do
-- editor, usada nos disparos pros leads). + marcador do aviso pré-sorteio.
alter table public.rifa_imagens
  add column if not exists tipo text not null default 'divulgacao';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rifa_imagens_tipo_check') then
    alter table public.rifa_imagens
      add constraint rifa_imagens_tipo_check check (tipo in ('divulgacao','cartela'));
  end if;
end $$;

comment on column public.rifa_imagens.tipo is
  'divulgacao = arte do editor (vai nos disparos aos leads) · cartela = grade de números gerada pelo cron (vai no Status a cada 30min).';

create index if not exists rifa_imagens_rifa_tipo_idx on public.rifa_imagens (rifa_id, tipo, created_at desc);

alter table public.rifas add column if not exists aviso_10min_em timestamptz;
comment on column public.rifas.aviso_10min_em is
  'Quando o aviso de ~10min antes do sorteio foi disparado (cron-aviso-sorteio-rifa). NULL = ainda não avisou.';
;

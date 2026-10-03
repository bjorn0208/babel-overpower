alter table public.rifas
  add column if not exists hora_sorteio time;

comment on column public.rifas.hora_sorteio is
  'Hora do sorteio em BRT. NULL = cai no fallback (arte da galeria → horário padrão do método). Fonte da verdade quando preenchida.';
;

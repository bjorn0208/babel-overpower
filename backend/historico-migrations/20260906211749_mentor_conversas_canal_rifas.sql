-- Bricio (canal 'rifas') precisa gravar conversa própria em `mentor_conversas`.
-- O CHECK listava só mentor/curadoria/financeiro — a aba do Bricio quebrava no
-- INSERT com "violates check constraint mentor_conversas_canal_check".
-- Mantém a trava (canal continua fechado numa lista), só admite o quarto valor.
alter table public.mentor_conversas
  drop constraint if exists mentor_conversas_canal_check;

alter table public.mentor_conversas
  add constraint mentor_conversas_canal_check
  check (canal = any (array['mentor'::text, 'curadoria'::text, 'financeiro'::text, 'rifas'::text]));
;

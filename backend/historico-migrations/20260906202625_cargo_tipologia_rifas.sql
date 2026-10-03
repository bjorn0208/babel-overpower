-- Bricio — agente dedicado ao app Rifas no canal interno (Theus, 2026-09-06).
-- Tipologia própria: o canal-interno resolve o cargo por tipologia, e reusar
-- 'mentor' faria o Bricio disputar o mesmo slot do Mentor generalista.
alter type public.cargo_tipologia add value if not exists 'rifas';
;

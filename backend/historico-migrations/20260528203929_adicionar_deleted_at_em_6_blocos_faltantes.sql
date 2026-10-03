-- Smoke playwright 2026-05-28 17:35 BRT identificou bug: hook useBlocosGaveta
-- chama `.is('deleted_at', null)` em todas as 8 tabelas blocos_*, mas só
-- blocos_padrao e blocos_procedurais têm a coluna. As outras 6 retornam
-- 400 PostgREST ("column blocos_*.deleted_at does not exist") e a aba
-- Blocos / Gatilhos / Conhecimento / etc carrega vazia em silêncio.
--
-- Fix: adicionar deleted_at timestamptz NULL nas 6 tabelas faltantes.
-- Soft delete padrão da plataforma (CLAUDE.md invioável "Soft delete via deleted_at").

ALTER TABLE public.blocos_comportamento ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.blocos_conhecimento  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.blocos_gatilho       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.blocos_humanizacao   ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.blocos_meta          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.blocos_variacao      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
;

-- UP: Remove coluna descricao de public.produtos
-- Coluna foi adicionada em 2026-04-20 como shortcut para sync-chunks mas nunca teve
-- uso real no domínio — frontend não preenche, formulário não expõe, zero dados gravados.
-- DOWN: supabase/migrations/20260420_revert_add_descricao_to_produtos_DOWN.sql

ALTER TABLE public.produtos DROP COLUMN IF EXISTS descricao;
;

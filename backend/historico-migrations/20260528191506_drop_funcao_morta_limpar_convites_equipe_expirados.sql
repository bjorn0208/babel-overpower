-- Fechamento P0 drift schema: função limpar_convites_equipe_expirados referenciava
-- tabela convites_equipe_pendentes que não existe mais (Big Bang Rename + migration
-- 20260523164000 corrigir_trigger_novo_usuario). Função era órfã (sem cron, sem
-- callers de runtime). Drop seguro.
-- Edge criar-membro-equipe (que também referencia a tabela morta) será arquivada
-- como source local + desativada via dashboard pelo Theus (MCP não tem
-- delete_edge_function). Substituta viva é a edge convidar-membro (callers no
-- frontend em hooksBundle.ts).

DROP FUNCTION IF EXISTS public.limpar_convites_equipe_expirados();
;

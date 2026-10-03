-- Limpeza: Theus cravou 2026-05-12 23:00 BRT. Plano consolidado L707: "Ragentic: deleta tudo".
-- As tabelas admin_ia_* já foram dropadas em onda anterior. Aqui caem as 15 funções, 2 triggers
-- e a tabela `mensagens_processadas` (0 registros, 0 callers reais).

-- 1. mensagens_processadas (0 registros, sem callers — tipo morto pré-Ragentic)
DROP TABLE IF EXISTS public.mensagens_processadas CASCADE;

-- 2. Funções admin_ia_*
DROP FUNCTION IF EXISTS public.admin_ia_custo_historico_meses CASCADE;
DROP FUNCTION IF EXISTS public.buscar_admin_ia_blocos_taxonomico CASCADE;
DROP FUNCTION IF EXISTS public.enfileirar_embedding_admin_ia_memoria CASCADE;
DROP FUNCTION IF EXISTS public.admin_ia_custo_mes_corrente CASCADE;
DROP FUNCTION IF EXISTS public.admin_ia_levantar_lead_360 CASCADE;
DROP FUNCTION IF EXISTS public.admin_ia_listar_fks CASCADE;
DROP FUNCTION IF EXISTS public.admin_ia_descrever_tabela CASCADE;
DROP FUNCTION IF EXISTS public.admin_ia_levantar_conversa_360 CASCADE;
DROP FUNCTION IF EXISTS public.admin_ia_levantar_tenant_360 CASCADE;
DROP FUNCTION IF EXISTS public.busca_hibrida_admin_ia CASCADE;
DROP FUNCTION IF EXISTS public.buscar_admin_ia_base_academica CASCADE;
DROP FUNCTION IF EXISTS public.buscar_admin_ia_memoria CASCADE;

-- 3. Triggers admin_ia (tabelas já não existem, mas funções triggers órfãs ficam vivas)
DROP FUNCTION IF EXISTS public.tg_admin_ia_blocos_updated CASCADE;
DROP FUNCTION IF EXISTS public.tg_admin_ia_blocos_enqueue_embedding CASCADE;
DROP FUNCTION IF EXISTS public.tg_admin_ia_memoria_updated_at CASCADE;

COMMENT ON SCHEMA public IS 'Limpeza admin_ia_* concluida 2026-05-12: tabelas dropadas onda anterior; funcoes/triggers/tabela mensagens_processadas dropadas nesta migration; edges admin-ia + 4 crons + expedicao-curador serao deletadas via CLI logo apos.';
;

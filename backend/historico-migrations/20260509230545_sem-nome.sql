
-- Desagendar crons admin_ia primeiro
DO $$
DECLARE
  v_jobname text;
BEGIN
  FOREACH v_jobname IN ARRAY ARRAY[
    'cron-admin-ia-aprendiz',
    'cron-admin-ia-curador',
    'cron-admin-ia-gerente',
    'cron-admin-ia-schemas'
  ] LOOP
    PERFORM cron.unschedule(v_jobname) FROM cron.job WHERE jobname = v_jobname;
  END LOOP;
END $$;

-- Drop tabelas admin_ia (CASCADE remove indexes/triggers/policies/FKs dependentes)
DROP TABLE IF EXISTS public.admin_ia_acoes CASCADE;
DROP TABLE IF EXISTS public.admin_ia_agendamentos CASCADE;
DROP TABLE IF EXISTS public.admin_ia_base_academica CASCADE;
DROP TABLE IF EXISTS public.admin_ia_blocos CASCADE;
DROP TABLE IF EXISTS public.admin_ia_config CASCADE;
DROP TABLE IF EXISTS public.admin_ia_conversas CASCADE;
DROP TABLE IF EXISTS public.admin_ia_documentos_ingeridos CASCADE;
DROP TABLE IF EXISTS public.admin_ia_dossies CASCADE;
DROP TABLE IF EXISTS public.admin_ia_ferramentas_desligadas CASCADE;
DROP TABLE IF EXISTS public.admin_ia_ferramentas_dinamicas CASCADE;
DROP TABLE IF EXISTS public.admin_ia_memoria CASCADE;
DROP TABLE IF EXISTS public.admin_ia_propostas CASCADE;
DROP TABLE IF EXISTS public.admin_ia_reflexao CASCADE;
DROP TABLE IF EXISTS public.admin_ia_relatorios CASCADE;

-- Drop outras tabelas órfãs (zero dados, zero refs no código frontend)
DROP TABLE IF EXISTS public.automacao_semantica CASCADE;
DROP TABLE IF EXISTS public.base_segmentos CASCADE;
DROP TABLE IF EXISTS public.atribuicoes_canario CASCADE;
DROP TABLE IF EXISTS public.exclusoes_tenant CASCADE;
DROP TABLE IF EXISTS public.repropostas_lead_campanha CASCADE;
DROP TABLE IF EXISTS public.produto_template_conhecimento CASCADE;
DROP TABLE IF EXISTS public.produto_template_midias CASCADE;
DROP TABLE IF EXISTS public.overrides_tenant_blocos_meta CASCADE;
DROP TABLE IF EXISTS public.convites_equipe_pendentes CASCADE;
DROP TABLE IF EXISTS public.entregas_pendentes CASCADE;
DROP TABLE IF EXISTS public.travas_lead CASCADE;

;

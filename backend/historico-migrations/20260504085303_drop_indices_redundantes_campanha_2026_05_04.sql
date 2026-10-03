-- R12 (auditoria 2026-05-04): DROP de 3 índices redundantes em tabelas de campanha.
DROP INDEX IF EXISTS public.idx_ctpm_type_trigger;
DROP INDEX IF EXISTS public.idx_campaigns_tenant_status;
DROP INDEX IF EXISTS public.campaign_indicacao_comissoes_campaign_id_idx;
;

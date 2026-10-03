-- 6 indices regulares redundantes — cada um tem um UNIQUE INDEX equivalente sobre
-- as mesmas colunas. UNIQUE ja serve queries de igualdade do regular. Drop libera
-- ~6 entradas no catalogo + economia de write amplification.
--
-- Mantidos (NAO sao duplicatas — sao filtered indexes diferentes):
--   campanhas: campaigns_pkey vs idx_campaigns_ativas (WHERE status='active')
--   memoria_lead: regular vs longo_lead (WHERE escopo='longo' AND ativa)
--   leads: 4 filtered diferentes em tenant_id
--   leads_campanha: 2 filtered diferentes em campaign_id

DROP INDEX IF EXISTS public.cronjobs_config_nome_idx;
DROP INDEX IF EXISTS public.idx_kv_cache_key;
DROP INDEX IF EXISTS public.compromissos_scheduled_action_id_idx;
DROP INDEX IF EXISTS public.idx_tenant_opt_outs_tenant_lead;
DROP INDEX IF EXISTS public.idx_campaign_phases_campaign_order;
DROP INDEX IF EXISTS public.nichos_slug_idx;
;

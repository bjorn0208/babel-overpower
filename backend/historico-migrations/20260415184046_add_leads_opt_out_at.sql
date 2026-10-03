
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS opt_out_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_leads_opt_out ON public.leads(tenant_id) WHERE opt_out_at IS NOT NULL;
COMMENT ON COLUMN public.leads.opt_out_at IS 'LGPD opt-out timestamp. Quando setado, agente nao mais responde/contata o lead. Set via trigger recusa_alta/opt_out_total.';

;

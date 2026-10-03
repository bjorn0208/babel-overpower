
-- Feature 1: Lead Quente (marcador de potencial)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_hot boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_leads_is_hot ON public.leads (tenant_id) WHERE is_hot = true;

-- Feature 2: Responsavel (atribuicao de membro da equipe)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads (assigned_to) WHERE assigned_to IS NOT NULL;

;

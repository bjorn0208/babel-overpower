-- Limpa lead_id órfãos (3 contratos apontavam pra leads que não existem)
UPDATE public.contracts c
SET lead_id = NULL
WHERE c.lead_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = c.lead_id);

-- FK pra Supabase reconhecer relacionamento e permitir embed (lead:leads(...))
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

-- Índice pra FK (regra do projeto)
CREATE INDEX IF NOT EXISTS contracts_lead_id_idx ON public.contracts (lead_id);
;

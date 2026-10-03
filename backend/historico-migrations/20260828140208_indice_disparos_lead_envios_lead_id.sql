CREATE INDEX IF NOT EXISTS idx_disparos_lead_envios_lead_id
  ON public.disparos_lead_envios USING btree (lead_id)
  WHERE lead_id IS NOT NULL;
;

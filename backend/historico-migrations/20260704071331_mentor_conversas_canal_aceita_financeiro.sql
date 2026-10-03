-- Canal 'financeiro' (assistente financeiro via WhatsApp) entra no CHECK de mentor_conversas.
ALTER TABLE public.mentor_conversas DROP CONSTRAINT IF EXISTS mentor_conversas_canal_check;
ALTER TABLE public.mentor_conversas
  ADD CONSTRAINT mentor_conversas_canal_check CHECK (canal IN ('mentor','curadoria','financeiro'));
;

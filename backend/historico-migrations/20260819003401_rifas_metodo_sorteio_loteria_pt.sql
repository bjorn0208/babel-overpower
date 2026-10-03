-- Novos métodos de sorteio: Loteria PT (PT Rio, PT Manhã, PT Noite, Corujinha).
-- Todos funcionam como a Loteria Federal: resultado oficial externo registrado
-- manualmente via `sortear_rifa(p_numero_manual)`. Idempotente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rifas_metodo_sorteio_check') THEN
    ALTER TABLE public.rifas DROP CONSTRAINT rifas_metodo_sorteio_check;
  END IF;
  ALTER TABLE public.rifas
    ADD CONSTRAINT rifas_metodo_sorteio_check
    CHECK (metodo_sorteio = ANY (ARRAY['loteria_federal'::text, 'plataforma'::text, 'pt_rio'::text, 'ptm'::text, 'ptn'::text, 'corujinha'::text]));
END $$;
;

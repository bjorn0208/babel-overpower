ALTER TABLE public.numeros_rifa
  DROP CONSTRAINT IF EXISTS numeros_rifa_numero_check;
ALTER TABLE public.numeros_rifa
  ADD CONSTRAINT numeros_rifa_numero_check CHECK (numero >= 0);

;

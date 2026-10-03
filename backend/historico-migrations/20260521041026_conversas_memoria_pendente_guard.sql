-- v61 (DEC-036 item 2): guard inline da memória no próximo turno.
-- Flag determinística e barata: marcada true quando o pós-turno dispara em background (v60),
-- false quando termina. O início do turno seguinte checa antes do Porteiro.
-- Aditiva e idempotente; conversas já tem RLS (sem policy nova).
ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS memoria_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS memoria_pendente_desde timestamptz;
;

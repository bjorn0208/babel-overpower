
-- Migration 1 (prova de conceito) — rename de sequence isolado
-- Postgres rastreia sequences por OID em pg_attrdef → rename não quebra default.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.sequences 
             WHERE sequence_schema='public' AND sequence_name='webhook_debug_id_seq') THEN
    ALTER SEQUENCE public.webhook_debug_id_seq RENAME TO debug_webhook_id_seq;
  END IF;
END $$;

-- Validação: count == 0
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.sequences
  WHERE sequence_schema='public' AND sequence_name='webhook_debug_id_seq';
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Sequence webhook_debug_id_seq ainda existe — rename falhou';
  END IF;
END $$;

;

-- Big-Bang vocab pt-BR drift: 28+ funcoes RPC referenciam colunas que foram renomeadas:
--   embedding -> vetor_semantico (todas as tabelas blocos_*, memoria_*, etc)
--   chunk_id  -> bloco_id        (todas as overrides_tenant_blocos_*)
-- Sem este fix, busca_hibrida_gatilho/comportamento/etc retornam erro em runtime,
-- agente nunca dispara trigger semantico, contrato nao gera, RAGs vazios.

DO $$
DECLARE
  fn record;
  novo_def text;
BEGIN
  FOR fn IN
    SELECT proname, oid, pg_get_functiondef(oid) AS def
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND (
        pg_get_functiondef(oid) ~ '\.embedding[^a-zA-Z0-9_]'
        OR pg_get_functiondef(oid) ~ '\.chunk_id[^a-zA-Z0-9_]'
      )
    ORDER BY proname
  LOOP
    novo_def := fn.def;
    -- 1. embedding -> vetor_semantico (preserva embedding_status/_job/_jobs etc)
    novo_def := regexp_replace(novo_def, '(\.\s*)embedding([^a-zA-Z0-9_])', '\1vetor_semantico\2', 'g');
    -- 2. chunk_id -> bloco_id (preserva chunk_size/chunk_index e outros se houver)
    novo_def := regexp_replace(novo_def, '(\.\s*)chunk_id([^a-zA-Z0-9_])', '\1bloco_id\2', 'g');

    IF novo_def = fn.def THEN
      RAISE NOTICE 'sem mudanca: %', fn.proname;
    ELSE
      EXECUTE novo_def;
      RAISE NOTICE 'atualizada: %', fn.proname;
    END IF;
  END LOOP;
END $$;
;

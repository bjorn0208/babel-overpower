-- Remove overload de 7 args; mantem versao de 9 args (com defaults p/ node/template)
DROP FUNCTION IF EXISTS public.enfileirar_acao_agendada(uuid, uuid, uuid, uuid, text, timestamptz, jsonb);
-- Re-aplicar grants na versao remanescente
REVOKE ALL ON FUNCTION public.enfileirar_acao_agendada(uuid, uuid, uuid, uuid, text, timestamptz, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enfileirar_acao_agendada(uuid, uuid, uuid, uuid, text, timestamptz, jsonb, text, text) TO service_role;
;

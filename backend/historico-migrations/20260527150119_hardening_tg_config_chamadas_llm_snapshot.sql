-- Hardening: trigger function não deve ser callable via REST RPC
REVOKE EXECUTE ON FUNCTION public.tg_config_chamadas_llm_snapshot() FROM anon, authenticated, PUBLIC;
;

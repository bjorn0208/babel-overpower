-- 2 wrappers EN puros que delegam pro PT-BR. Zero callers TS (frontend e edges
-- usam a versao PT direto). pg_depend = 0 dependentes. Drop seguro.
--
-- get_public_service_flow(text)  -> wrapper de obter_fluxo_publico_servico
-- get_conversation_prompts(uuid) -> wrapper de obter_prompts_conversa
--
-- Mantido fora deste DROP: get_conversas_usadas(uuid) — chamada por
-- atualizar_cache_conversas_usadas() via SQL interno, cadeia em uso (memory
-- retomar-fase1-completa-2026-04-24).

DROP FUNCTION IF EXISTS public.get_public_service_flow(text);
DROP FUNCTION IF EXISTS public.get_conversation_prompts(uuid);
;

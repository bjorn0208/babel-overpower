-- Advisor apontou: tg_rifa_templates_mensagem_updated_at() (SECURITY DEFINER)
-- ficou executável via RPC por anon/authenticated (/rest/v1/rpc/...). Só deve
-- rodar como trigger, nunca chamada direta. Revoga o EXECUTE público — trigger
-- continua funcionando normal (não depende de grant pro role que fez o UPDATE).
REVOKE EXECUTE ON FUNCTION public.tg_rifa_templates_mensagem_updated_at() FROM PUBLIC, anon, authenticated;

;

-- Trigger functions não precisam ser executáveis via RPC — só pelo trigger
-- interno do Postgres. Revogar EXECUTE dos roles `anon` e `authenticated`
-- pra silenciar advisors security_definer_function_executable e fechar
-- superfície de RPC desnecessária.

REVOKE EXECUTE ON FUNCTION public.tg_loja_aplicativos_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_arquivos_textos_updated_at() FROM anon, authenticated;

;

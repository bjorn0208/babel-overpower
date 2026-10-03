-- Função de trigger não deve ser invocável via PostgREST por anon/authenticated.
-- Só o executor de trigger (postgres) precisa dela.
REVOKE EXECUTE ON FUNCTION public.tg_soft_delete_desativa() FROM PUBLIC, anon, authenticated;
;

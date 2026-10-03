-- O REVOKE de `anon` sozinho não adianta: no Postgres toda função nasce com
-- EXECUTE pra PUBLIC, e é por aí que o `anon` entrava. Tira de PUBLIC e devolve
-- só pra quem precisa.
REVOKE EXECUTE ON FUNCTION public.resumo_ausencia(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resumo_ausencia(timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.resumo_ausencia(timestamptz) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.resumo_ausencia(timestamptz) TO service_role;
;

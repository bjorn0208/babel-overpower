-- recomputar_humor_relacao é cron-only (roda no SONO). Tira do alcance de anon/authenticated
-- via PostgREST RPC (fecha o warning *_security_definer_function_executable + vetor de abuso/DoS).
-- O cron roda como postgres (owner) → continua executando normal.
REVOKE EXECUTE ON FUNCTION public.recomputar_humor_relacao(integer) FROM PUBLIC;
;

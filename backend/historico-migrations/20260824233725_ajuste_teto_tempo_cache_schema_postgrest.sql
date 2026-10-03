-- Aprovado pelo Theus em conversa (2026-08-24): recuperação do PGRST002.
-- O cache de schema do PostgREST não termina em 30s neste compute; 120s
-- permite montar uma vez e manter em memória. Roles de usuário (anon 3s,
-- authenticated 8s) não mudam — zero impacto nas consultas do app.
ALTER ROLE authenticator SET statement_timeout = '120s';
;

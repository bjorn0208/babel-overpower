-- PGRST002: o cache de schema do PostgREST (190+ tabelas, 1000+ policies) não
-- fecha em 8s e a API inteira fica 503. Sobe o teto SÓ do authenticator (as
-- consultas dos usuários seguem limitadas por anon=3s / authenticated=8s).
ALTER ROLE authenticator SET statement_timeout = '30s';
;

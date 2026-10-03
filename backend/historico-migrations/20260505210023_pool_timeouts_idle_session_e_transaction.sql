-- Liga timeouts de sessão e transação idle no banco de produção
-- Motivo: pool de 60 conexões do Pro Micro estoura por acúmulo de conexões idle
-- que nunca fecham. Sem esses timeouts (default 0 = desligado), PostgREST e
-- Storage Canary acumulam conexões zumbi até estourar `max_connections`.
-- 600s = 10 min é seguro pra carga normal; 30s em transação corta loops.
-- Reversível com ALTER DATABASE postgres RESET <param>.

ALTER DATABASE postgres SET idle_session_timeout = '600000';
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '30000';
;

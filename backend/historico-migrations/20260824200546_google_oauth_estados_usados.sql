-- Anti-replay do fluxo OAuth Google: cada state assinado vale UMA vez.
-- O callback grava o hash do state aqui; segunda tentativa com o mesmo state
-- bate no PK e é rejeitada. Linhas velhas são lixo efêmero (state expira em
-- 15 min sozinho) — sem soft delete de propósito.
-- Down: drop table public.google_oauth_estados_usados.
CREATE TABLE IF NOT EXISTS public.google_oauth_estados_usados (
  state_hash text PRIMARY KEY,
  usado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_oauth_estados_usados ENABLE ROW LEVEL SECURITY;
-- Trancada: só service_role (edge do callback).
;

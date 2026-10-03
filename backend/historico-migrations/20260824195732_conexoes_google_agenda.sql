-- Fundação da integração Google Agenda: 1 conexão por tenant.
-- Regra do produto: retorno/follow-up → calendário "Babel OS" do tenant;
-- reunião/call → agenda principal (primary) do tenant.
-- refresh_token NUNCA chega no frontend: tabela SEM policy pra authenticated
-- (RLS ligada e trancada — só service_role via edges).
-- Down: drop table public.conexoes_google.

CREATE TABLE IF NOT EXISTS public.conexoes_google (
  tenant_id uuid PRIMARY KEY REFERENCES public.profiles(id),
  google_email text,
  refresh_token text NOT NULL,
  calendario_babel_id text,
  escopos text,
  conectado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.conexoes_google ENABLE ROW LEVEL SECURITY;

-- Sem policy de authenticated de propósito: o dono consulta o STATUS da conexão
-- via edge (service_role), nunca lê o token. service_role bypassa RLS.

COMMENT ON TABLE public.conexoes_google IS
  'Conexão Google Agenda por tenant (OAuth). Retorno→calendário Babel OS; reunião→primary. Token só via edges (service_role).';
;

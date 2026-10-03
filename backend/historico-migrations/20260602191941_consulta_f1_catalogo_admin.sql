-- App Consulta F1 — catálogo gerido pelo admin: tipos, config da API, pacotes de recarga

-- 3.1 Tipos de consulta (catálogo)
CREATE TABLE IF NOT EXISTS public.consultas_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  codigo_api text NOT NULL,                 -- id do serviço na API externa (ex: "5")
  categoria text NOT NULL DEFAULT 'credito',-- credito / veicular
  tipo_doc text NOT NULL DEFAULT 'cpf' CHECK (tipo_doc IN ('cpf','cnpj','ambos','placa','chassi')),
  custo numeric(10,2) NOT NULL CHECK (custo >= 0),     -- R$ que debita do tenant
  sale_api numeric(10,2) CHECK (sale_api IS NULL OR sale_api >= 0), -- custo na API (referência de margem)
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS consultas_tipos_ativo_idx ON public.consultas_tipos (ativo, ordem) WHERE deleted_at IS NULL;

ALTER TABLE public.consultas_tipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_le_tipos_ativos" ON public.consultas_tipos;
CREATE POLICY "tenant_le_tipos_ativos" ON public.consultas_tipos
  FOR SELECT TO authenticated USING (ativo = true AND deleted_at IS NULL);
DROP POLICY IF EXISTS "admin_gere_tipos" ON public.consultas_tipos;
CREATE POLICY "admin_gere_tipos" ON public.consultas_tipos
  FOR ALL TO authenticated USING (public.eh_admin_plataforma()) WITH CHECK (public.eh_admin_plataforma());

-- 3.2 Config/credenciais da API (singleton)
CREATE TABLE IF NOT EXISTS public.consultas_config_api (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor text NOT NULL,
  url_base text NOT NULL,
  secret_nome text,                         -- ponteiro do vault (login/senha nunca aqui)
  ativo boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consultas_config_api ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_gere_config_api" ON public.consultas_config_api;
CREATE POLICY "admin_gere_config_api" ON public.consultas_config_api
  FOR ALL TO authenticated USING (public.eh_admin_plataforma()) WITH CHECK (public.eh_admin_plataforma());

-- 3.6 Pacotes de recarga
CREATE TABLE IF NOT EXISTS public.consultas_pacotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  valor numeric(10,2) NOT NULL CHECK (valor > 0),    -- R$ que o tenant paga
  credito numeric(10,2) NOT NULL CHECK (credito > 0),-- R$ que entra na carteira
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS consultas_pacotes_ativo_idx ON public.consultas_pacotes (ativo, ordem) WHERE deleted_at IS NULL;

ALTER TABLE public.consultas_pacotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_le_pacotes_ativos" ON public.consultas_pacotes;
CREATE POLICY "tenant_le_pacotes_ativos" ON public.consultas_pacotes
  FOR SELECT TO authenticated USING (ativo = true AND deleted_at IS NULL);
DROP POLICY IF EXISTS "admin_gere_pacotes" ON public.consultas_pacotes;
CREATE POLICY "admin_gere_pacotes" ON public.consultas_pacotes
  FOR ALL TO authenticated USING (public.eh_admin_plataforma()) WITH CHECK (public.eh_admin_plataforma());
;

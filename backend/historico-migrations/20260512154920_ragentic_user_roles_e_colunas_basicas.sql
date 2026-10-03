-- =========================================================================
-- Migration aditiva: schema Ragentic (limpa-nome-ia)
-- 1) user_roles (autorização admin)
-- 2) Colunas faltantes em cargos / conversas / agentes
-- 3) Índices + RLS
-- =========================================================================

-- ---- user_roles ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','user')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles (user_id);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_roles_leitura_proprio ON public.user_roles;
CREATE POLICY user_roles_leitura_proprio ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_admin_all ON public.user_roles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

-- Backfill: copia system_role=platform_admin de profiles pra user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM public.profiles WHERE system_role = 'platform_admin'
ON CONFLICT DO NOTHING;

-- ---- agentes: colunas Ragentic ------------------------------------------
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS persona text;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS prompt_sistema text;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS tom_de_voz text;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS modelo_sintese text DEFAULT 'google/gemini-2.5-flash';
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS modelo_porteiro text DEFAULT 'google/gemma-3-27b-it';
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS nicho text;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS nicho_id uuid REFERENCES public.nichos(id) ON DELETE SET NULL;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS agentes_owner_idx ON public.agentes (owner_id);
CREATE INDEX IF NOT EXISTS agentes_nicho_idx ON public.agentes (nicho_id);

-- ---- cargos: colunas Ragentic --------------------------------------------
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS agente_id uuid REFERENCES public.agentes(id) ON DELETE CASCADE;
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS cargos_agente_ordem_idx ON public.cargos (agente_id, ordem);

-- ---- conversas: colunas Ragentic -----------------------------------------
ALTER TABLE public.conversas ADD COLUMN IF NOT EXISTS agente_id uuid REFERENCES public.agentes(id) ON DELETE SET NULL;
ALTER TABLE public.conversas ADD COLUMN IF NOT EXISTS cargo_ativo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL;
ALTER TABLE public.conversas ADD COLUMN IF NOT EXISTS titulo text;
ALTER TABLE public.conversas ADD COLUMN IF NOT EXISTS score_lead integer;
ALTER TABLE public.conversas ADD COLUMN IF NOT EXISTS encerrada_em timestamptz;
ALTER TABLE public.conversas ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS conversas_agente_cargo_idx ON public.conversas (agente_id, cargo_ativo_id);
CREATE INDEX IF NOT EXISTS conversas_agente_atualizado_idx ON public.conversas (agente_id, atualizado_em DESC) WHERE encerrada_em IS NULL;

COMMENT ON TABLE public.user_roles IS 'Roles autorizadoras espelhando profiles.system_role. Lida por useEhAdmin do limpa-nome-ia.';
;

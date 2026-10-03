-- Tabelas de override por tenant para as 4 gavetas de conteúdo que faltavam:
-- procedurais, emocao, prova_social, anti_padroes.
-- Espelha o contrato das 5 existentes (overrides_tenant_blocos_*):
--   PK (bloco_id, tenant_id); ativo=false => bloco herdado DESLIGADO pelo tenant.
--   FK bloco_id -> tabela do bloco (ON DELETE CASCADE); FK tenant_id -> profiles(id).
--   RLS: tenant só enxerga/mexe nos próprios overrides; service_role full.
-- Idempotente.

-- 1) Procedimentos (blocos_procedurais)
CREATE TABLE IF NOT EXISTS public.overrides_tenant_blocos_procedurais (
  bloco_id   uuid        NOT NULL REFERENCES public.blocos_procedurais(id) ON DELETE CASCADE,
  tenant_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo      boolean     NOT NULL DEFAULT false,
  motivo     text,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bloco_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS overrides_tenant_blocos_procedurais_tenant_idx
  ON public.overrides_tenant_blocos_procedurais (tenant_id);
ALTER TABLE public.overrides_tenant_blocos_procedurais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_own_override ON public.overrides_tenant_blocos_procedurais;
CREATE POLICY tenant_own_override ON public.overrides_tenant_blocos_procedurais
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));
DROP POLICY IF EXISTS service_role_all_override ON public.overrides_tenant_blocos_procedurais;
CREATE POLICY service_role_all_override ON public.overrides_tenant_blocos_procedurais
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Emoção (emocao_blocos)
CREATE TABLE IF NOT EXISTS public.overrides_tenant_blocos_emocao (
  bloco_id   uuid        NOT NULL REFERENCES public.emocao_blocos(id) ON DELETE CASCADE,
  tenant_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo      boolean     NOT NULL DEFAULT false,
  motivo     text,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bloco_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS overrides_tenant_blocos_emocao_tenant_idx
  ON public.overrides_tenant_blocos_emocao (tenant_id);
ALTER TABLE public.overrides_tenant_blocos_emocao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_own_override ON public.overrides_tenant_blocos_emocao;
CREATE POLICY tenant_own_override ON public.overrides_tenant_blocos_emocao
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));
DROP POLICY IF EXISTS service_role_all_override ON public.overrides_tenant_blocos_emocao;
CREATE POLICY service_role_all_override ON public.overrides_tenant_blocos_emocao
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Prova social (prova_social_blocos)
CREATE TABLE IF NOT EXISTS public.overrides_tenant_blocos_prova_social (
  bloco_id   uuid        NOT NULL REFERENCES public.prova_social_blocos(id) ON DELETE CASCADE,
  tenant_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo      boolean     NOT NULL DEFAULT false,
  motivo     text,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bloco_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS overrides_tenant_blocos_prova_social_tenant_idx
  ON public.overrides_tenant_blocos_prova_social (tenant_id);
ALTER TABLE public.overrides_tenant_blocos_prova_social ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_own_override ON public.overrides_tenant_blocos_prova_social;
CREATE POLICY tenant_own_override ON public.overrides_tenant_blocos_prova_social
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));
DROP POLICY IF EXISTS service_role_all_override ON public.overrides_tenant_blocos_prova_social;
CREATE POLICY service_role_all_override ON public.overrides_tenant_blocos_prova_social
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Anti-padrões (anti_padroes)
CREATE TABLE IF NOT EXISTS public.overrides_tenant_blocos_anti_padroes (
  bloco_id   uuid        NOT NULL REFERENCES public.anti_padroes(id) ON DELETE CASCADE,
  tenant_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo      boolean     NOT NULL DEFAULT false,
  motivo     text,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bloco_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS overrides_tenant_blocos_anti_padroes_tenant_idx
  ON public.overrides_tenant_blocos_anti_padroes (tenant_id);
ALTER TABLE public.overrides_tenant_blocos_anti_padroes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_own_override ON public.overrides_tenant_blocos_anti_padroes;
CREATE POLICY tenant_own_override ON public.overrides_tenant_blocos_anti_padroes
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));
DROP POLICY IF EXISTS service_role_all_override ON public.overrides_tenant_blocos_anti_padroes;
CREATE POLICY service_role_all_override ON public.overrides_tenant_blocos_anti_padroes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;

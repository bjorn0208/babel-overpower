CREATE TABLE IF NOT EXISTS public.sotaques_catalogo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marcador      text NOT NULL,
  marcador_norm text GENERATED ALWAYS AS (lower(marcador)) STORED,
  regiao        text NOT NULL CHECK (regiao IN ('NE','SE','S','CO','N','geral')),
  uf            text CHECK (uf IS NULL OR length(uf) = 2),
  exemplos      text[] DEFAULT ARRAY[]::text[],
  fonte         text DEFAULT 'seed' CHECK (fonte IN ('seed','curado','aprendido')),
  ativo         boolean NOT NULL DEFAULT true,
  curado_por    uuid REFERENCES public.profiles(id),
  validado_em   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sotaques_catalogo_uniq ON public.sotaques_catalogo (marcador_norm) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS sotaques_catalogo_regiao_idx ON public.sotaques_catalogo (regiao, uf) WHERE ativo = true;
ALTER TABLE public.sotaques_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sc_admin_all ON public.sotaques_catalogo;
CREATE POLICY sc_admin_all ON public.sotaques_catalogo FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS sc_read_all ON public.sotaques_catalogo;
CREATE POLICY sc_read_all ON public.sotaques_catalogo FOR SELECT TO authenticated USING (ativo = true);

CREATE TABLE IF NOT EXISTS public.sotaques_observados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL,
  marcadores      text[] NOT NULL,
  regiao_inferida text CHECK (regiao_inferida IN ('NE','SE','S','CO','N','geral','desconhecida')),
  uf_inferida     text,
  confianca       numeric NOT NULL DEFAULT 0.5,
  fonte_msg       text,
  trecho_amostra  text,
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','recusado','correcao')),
  validado_por    uuid REFERENCES public.profiles(id),
  validado_em     timestamptz,
  motivo_validacao text,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sotaques_obs_status_idx ON public.sotaques_observados (status, criado_em);
CREATE INDEX IF NOT EXISTS sotaques_obs_lead_idx ON public.sotaques_observados (lead_id) WHERE status = 'aprovado';
CREATE INDEX IF NOT EXISTS sotaques_obs_tenant_idx ON public.sotaques_observados (tenant_id);
ALTER TABLE public.sotaques_observados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS so_admin_all ON public.sotaques_observados;
CREATE POLICY so_admin_all ON public.sotaques_observados FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS so_service_role ON public.sotaques_observados;
CREATE POLICY so_service_role ON public.sotaques_observados FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.sotaques_candidatos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marcador        text NOT NULL,
  ocorrencias     int NOT NULL DEFAULT 1,
  primeira_em     timestamptz NOT NULL DEFAULT now(),
  ultima_em       timestamptz NOT NULL DEFAULT now(),
  exemplos        text[] DEFAULT ARRAY[]::text[],
  regiao_palpite  text,
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','promovido','recusado'))
);
CREATE UNIQUE INDEX IF NOT EXISTS sotaques_cand_marcador_uniq ON public.sotaques_candidatos (lower(marcador));
ALTER TABLE public.sotaques_candidatos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scd_admin_all ON public.sotaques_candidatos;
CREATE POLICY scd_admin_all ON public.sotaques_candidatos FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS scd_service_role ON public.sotaques_candidatos;
CREATE POLICY scd_service_role ON public.sotaques_candidatos FOR ALL TO service_role USING (true) WITH CHECK (true);

;

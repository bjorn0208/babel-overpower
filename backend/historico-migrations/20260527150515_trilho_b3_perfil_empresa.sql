-- Trilho B3 do fosso — perfil_empresa (destilação vertical do tenant)
-- 1 linha por tenant. Cron-destilar-perfil-empresa popula a partir de conversas com desfecho.
-- Coração do fosso: agente aprende COMO o tenant ganha clientes (não só o que ele vende).

CREATE TABLE IF NOT EXISTS public.perfil_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Identidade
  segmento text,                          -- nicho_nome (cache)
  razao_social text,
  nome_fantasia text,

  -- Métricas comerciais destiladas
  ticket_medio_estimado numeric(12,2),
  prazo_decisao_medio_dias int,
  taxa_conversao_estimada numeric(5,4),  -- 0.0 a 1.0

  -- Padrões aprendidos (cada item: {texto, frequencia, exemplos_conversa_ids[]})
  top_objecoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_pontos_dor jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_diferenciais jsonb NOT NULL DEFAULT '[]'::jsonb,
  argumentos_ganhadores jsonb NOT NULL DEFAULT '[]'::jsonb,
  argumentos_perdedores jsonb NOT NULL DEFAULT '[]'::jsonb,
  perfil_lead_ideal jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Metadados de destilação
  destilacao_ultima_em timestamptz,
  conversas_destiladas int NOT NULL DEFAULT 0,
  versao int NOT NULL DEFAULT 1,

  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS perfil_empresa_segmento_idx
  ON public.perfil_empresa (segmento)
  WHERE segmento IS NOT NULL;

COMMENT ON TABLE public.perfil_empresa IS
  'Trilho B3 — destilação vertical do tenant. 1 row por tenant. Agente lê pra entender padrão de venda do dono. Popula via cron-destilar-perfil-empresa (a criar).';

-- RLS: tenant lê o próprio + platform_admin lê todos
ALTER TABLE public.perfil_empresa ENABLE ROW LEVEL SECURITY;

CREATE POLICY perfil_empresa_proprio ON public.perfil_empresa
  FOR SELECT TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid()) AND ur.role = 'platform_admin'
    )
  );

CREATE POLICY perfil_empresa_admin_write ON public.perfil_empresa
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid()) AND ur.role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid()) AND ur.role = 'platform_admin'
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_perfil_empresa_atualizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_perfil_empresa_atualizado ON public.perfil_empresa;
CREATE TRIGGER tg_perfil_empresa_atualizado
  BEFORE UPDATE ON public.perfil_empresa
  FOR EACH ROW EXECUTE FUNCTION public.tg_perfil_empresa_atualizado();

REVOKE EXECUTE ON FUNCTION public.tg_perfil_empresa_atualizado() FROM anon, authenticated, PUBLIC;
;

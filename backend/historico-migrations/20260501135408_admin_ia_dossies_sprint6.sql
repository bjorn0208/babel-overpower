CREATE TABLE IF NOT EXISTS public.admin_ia_dossies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('curador','avancado')),
  escopo jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'rodando' CHECK (status IN ('rodando','concluido','erro','cancelado')),
  fase_atual text,
  resumo_executivo text,
  achados_principais jsonb DEFAULT '[]'::jsonb,
  propostas_por_gaveta jsonb DEFAULT '{}'::jsonb,
  insights_estruturais jsonb DEFAULT '[]'::jsonb,
  metricas jsonb DEFAULT '{}'::jsonb,
  erro_detalhe text,
  iniciado_por uuid REFERENCES auth.users(id),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  conversation_id uuid REFERENCES public.admin_ia_conversations(id)
);

ALTER TABLE public.admin_ia_dossies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_ia_dossies_admin_all ON public.admin_ia_dossies;
CREATE POLICY admin_ia_dossies_admin_all
  ON public.admin_ia_dossies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role='platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role='platform_admin'));

CREATE INDEX IF NOT EXISTS admin_ia_dossies_iniciado_em_idx ON public.admin_ia_dossies (iniciado_em DESC);
CREATE INDEX IF NOT EXISTS admin_ia_dossies_status_idx ON public.admin_ia_dossies (status) WHERE status = 'rodando';
;

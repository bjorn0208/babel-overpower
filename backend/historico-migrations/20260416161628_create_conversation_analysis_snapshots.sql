
SET search_path = public, auth;

CREATE TABLE IF NOT EXISTS public.conversation_analysis_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  turno int NOT NULL,
  rapport int NOT NULL CHECK (rapport BETWEEN 0 AND 10),
  interesse int NOT NULL CHECK (interesse BETWEEN 0 AND 10),
  prontidao int NOT NULL CHECK (prontidao BETWEEN 0 AND 10),
  energia int NOT NULL CHECK (energia BETWEEN 0 AND 10),
  palavras_lead int NOT NULL DEFAULT 0,
  palavras_agente int NOT NULL DEFAULT 0,
  dic_dor_count int NOT NULL DEFAULT 0,
  dic_interesse_count int NOT NULL DEFAULT 0,
  dic_pressa_count int NOT NULL DEFAULT 0,
  dic_raiva_count int NOT NULL DEFAULT 0,
  lead_fez_pergunta boolean NOT NULL DEFAULT false,
  lead_pediu_direto boolean NOT NULL DEFAULT false,
  lead_compartilhou_dor boolean NOT NULL DEFAULT false,
  silencio_seg int NOT NULL DEFAULT 0,
  bolhas_recomendadas int NOT NULL DEFAULT 1,
  tom_sugerido text NOT NULL DEFAULT 'neutro',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cas_conv_turno ON public.conversation_analysis_snapshots (conversation_id, turno);
CREATE INDEX IF NOT EXISTS idx_cas_tenant_created ON public.conversation_analysis_snapshots (tenant_id, created_at DESC);

ALTER TABLE public.conversation_analysis_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY cas_tenant_select ON public.conversation_analysis_snapshots FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR is_platform_admin());

CREATE POLICY cas_service_role ON public.conversation_analysis_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

;

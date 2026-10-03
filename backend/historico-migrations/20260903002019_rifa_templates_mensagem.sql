-- Biblioteca de templates de mensagem reutilizáveis por categoria (Theus
-- 2026-09-02) — não existia nada assim no projeto (rifa_agendamentos_disparo
-- guarda 1 mensagem solta por agendamento, sem categoria/reuso).
CREATE TABLE IF NOT EXISTS public.rifa_templates_mensagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN ('alerta','atualizacao','promocao')),
  titulo text NOT NULL,
  mensagem text NOT NULL,
  midia_url text,
  tipo_conteudo text NOT NULL DEFAULT 'texto' CHECK (tipo_conteudo IN ('foto','texto','video','foto_texto')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rifa_templates_mensagem_tenant_idx ON public.rifa_templates_mensagem (tenant_id);
CREATE INDEX IF NOT EXISTS rifa_templates_mensagem_categoria_idx ON public.rifa_templates_mensagem (tenant_id, categoria) WHERE ativo;

ALTER TABLE public.rifa_templates_mensagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY rifa_templates_mensagem_tenant_all ON public.rifa_templates_mensagem
  FOR ALL TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.parent_user_id = rifa_templates_mensagem.tenant_id)
  )
  WITH CHECK (
    tenant_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.parent_user_id = rifa_templates_mensagem.tenant_id)
  );

CREATE POLICY rifa_templates_mensagem_service ON public.rifa_templates_mensagem
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_rifa_templates_mensagem_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rifa_templates_mensagem_updated_at ON public.rifa_templates_mensagem;
CREATE TRIGGER trg_rifa_templates_mensagem_updated_at
  BEFORE UPDATE ON public.rifa_templates_mensagem
  FOR EACH ROW EXECUTE FUNCTION public.tg_rifa_templates_mensagem_updated_at();

;

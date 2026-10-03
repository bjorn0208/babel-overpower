-- Notas do app "Notas" — segundo app instalável. Suporta:
-- - texto livre + lista de checks inline
-- - lembrete por data/hora (timestamp)
-- - cravar no Desktop (post-it flutuante arrastável)
-- - status: ativa | concluida | arquivada
-- - cor pra futuras paletas (default amarelo papel)

CREATE TABLE IF NOT EXISTS public.notas_app (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  titulo text NOT NULL DEFAULT 'Sem título',
  conteudo text NOT NULL DEFAULT '',
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_lembrete timestamptz NULL,
  posicao jsonb NULL,
  cor text NOT NULL DEFAULT 'amarelo',
  status text NOT NULL DEFAULT 'ativa',
  cravada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT notas_app_pkey PRIMARY KEY (id),
  CONSTRAINT notas_app_user_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT notas_app_status_check CHECK (status IN ('ativa','concluida','arquivada')),
  CONSTRAINT notas_app_cor_check CHECK (cor IN ('amarelo','rosa','verde','azul'))
);

CREATE INDEX IF NOT EXISTS idx_notas_app_user_ativo
  ON public.notas_app (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notas_app_user_cravadas
  ON public.notas_app (user_id)
  WHERE cravada = true AND status = 'ativa' AND deleted_at IS NULL;

-- updated_at automático (SECURITY INVOKER — só altera NEW)
CREATE OR REPLACE FUNCTION public.tg_notas_app_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notas_app_updated_at ON public.notas_app;
CREATE TRIGGER trg_notas_app_updated_at
  BEFORE UPDATE ON public.notas_app
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_notas_app_updated_at();

-- RLS
ALTER TABLE public.notas_app ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_proprias_notas" ON public.notas_app;
CREATE POLICY "user_read_proprias_notas" ON public.notas_app
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "user_insert_proprias_notas" ON public.notas_app;
CREATE POLICY "user_insert_proprias_notas" ON public.notas_app
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_update_proprias_notas" ON public.notas_app;
CREATE POLICY "user_update_proprias_notas" ON public.notas_app
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_delete_proprias_notas" ON public.notas_app;
CREATE POLICY "user_delete_proprias_notas" ON public.notas_app
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "service_role_full_notas" ON public.notas_app;
CREATE POLICY "service_role_full_notas" ON public.notas_app
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.notas_app IS 'Notas do app "Notas" — texto + checks inline + lembrete + post-it físico no Desktop. cravada=true renderiza no PostitsFlutuantes. posicao jsonb {x,y,w,h}. status ativa|concluida|arquivada.';

;

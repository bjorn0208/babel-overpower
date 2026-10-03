CREATE TABLE IF NOT EXISTS public.vocabulario_curadoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contexto text NOT NULL,
  valor text NOT NULL,
  rotulo text,
  descricao text,
  vezes_usado integer NOT NULL DEFAULT 0,
  escopo text NOT NULL DEFAULT 'plataforma' CHECK (escopo IN ('plataforma','nicho','tenant')),
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vocab_unique_per_escopo UNIQUE (contexto, valor, escopo, nicho_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_vocab_contexto_ativo
  ON public.vocabulario_curadoria(contexto, ativo);

ALTER TABLE public.vocabulario_curadoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vocab_admin_all" ON public.vocabulario_curadoria;
CREATE POLICY "vocab_admin_all" ON public.vocabulario_curadoria
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND system_role = 'platform_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND system_role = 'platform_admin')
  );

DROP POLICY IF EXISTS "vocab_read_all" ON public.vocabulario_curadoria;
CREATE POLICY "vocab_read_all" ON public.vocabulario_curadoria
  FOR SELECT TO authenticated USING (ativo = true);

CREATE OR REPLACE FUNCTION public.tg_vocab_atualizado_em()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN NEW.atualizado_em := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_vocab_atualizado_em ON public.vocabulario_curadoria;
CREATE TRIGGER trg_vocab_atualizado_em
  BEFORE UPDATE ON public.vocabulario_curadoria
  FOR EACH ROW EXECUTE FUNCTION public.tg_vocab_atualizado_em();

COMMENT ON TABLE public.vocabulario_curadoria IS
'Lista canônica de valores controlados (categoria knowledge, severidade manipulacao, etc). Editável só por platform_admin via Curadoria.';
;

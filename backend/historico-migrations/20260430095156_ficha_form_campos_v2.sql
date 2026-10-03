-- Form Builder da ficha do contato (Curadoria v2 · F3)
-- Campos editáveis por nicho · admin-only edita · todos os authenticated leem ativo=true
-- Substitui o esquema fixo de leads.dados_ficha hardcoded em AbaIdentidade.tsx

CREATE TABLE IF NOT EXISTS public.ficha_form_campos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_id      uuid NOT NULL REFERENCES public.nichos(id) ON DELETE CASCADE,
  ordem         int  NOT NULL DEFAULT 0,
  secao         text NOT NULL DEFAULT 'Geral',
  chave         text NOT NULL,
  rotulo        text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN (
                  'texto_curto','texto_longo','numero','data',
                  'telefone','valor_brl','select','multi_select','lista_repetivel'
                )),
  opcoes        jsonb,
  sub_campos    jsonb,
  obrigatorio   boolean NOT NULL DEFAULT false,
  placeholder   text,
  descricao     text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- FK index obrigatório
CREATE INDEX IF NOT EXISTS ficha_form_campos_niche_idx
  ON public.ficha_form_campos (niche_id) WHERE deleted_at IS NULL;

-- Lookup rápido por chave dentro do nicho
CREATE UNIQUE INDEX IF NOT EXISTS ficha_form_campos_niche_chave_uniq
  ON public.ficha_form_campos (niche_id, chave) WHERE deleted_at IS NULL;

-- Ordem dentro de seção
CREATE INDEX IF NOT EXISTS ficha_form_campos_niche_secao_ordem_idx
  ON public.ficha_form_campos (niche_id, secao, ordem) WHERE deleted_at IS NULL AND ativo = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_ficha_form_campos_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ficha_form_campos_updated_at ON public.ficha_form_campos;
CREATE TRIGGER ficha_form_campos_updated_at
  BEFORE UPDATE ON public.ficha_form_campos
  FOR EACH ROW EXECUTE FUNCTION public.tg_ficha_form_campos_updated_at();

ALTER TABLE public.ficha_form_campos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ficha_form_campos_admin_all ON public.ficha_form_campos;
CREATE POLICY ficha_form_campos_admin_all ON public.ficha_form_campos
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.system_role = 'platform_admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.system_role = 'platform_admin'
  ));

DROP POLICY IF EXISTS ficha_form_campos_read_all ON public.ficha_form_campos;
CREATE POLICY ficha_form_campos_read_all ON public.ficha_form_campos
  FOR SELECT TO authenticated
  USING (ativo = true AND deleted_at IS NULL);

COMMENT ON TABLE public.ficha_form_campos IS 'Form Builder da ficha do contato (Curadoria v2 · F3). Campos editáveis por nicho via painel admin. Substitui schema fixo de leads.dados_ficha. tipo: texto_curto|texto_longo|numero|data|telefone|valor_brl|select|multi_select|lista_repetivel. opcoes jsonb pra select/multi-select. sub_campos jsonb pra lista_repetivel. Tenant herda automático e renderiza dinâmico em AbaIdentidade.';

;

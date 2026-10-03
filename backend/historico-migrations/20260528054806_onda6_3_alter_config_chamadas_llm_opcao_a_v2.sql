-- ============================================================================
-- Onda 6.3 v2 — ALTER TABLE config_chamadas_llm OPÇÃO A (DEC-040)
-- Ajuste: também rename colunas do histórico + recriar trigger snapshot
-- ============================================================================

-- 1) DROP trigger snapshot antigo (vai voltar com nomes novos)
DROP TRIGGER IF EXISTS tg_config_chamadas_llm_snapshot ON public.config_chamadas_llm;

-- 2) Renames em config_chamadas_llm (3 colunas)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='config_chamadas_llm' AND column_name='id') THEN
    ALTER TABLE public.config_chamadas_llm RENAME COLUMN id TO chave;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='config_chamadas_llm' AND column_name='prompt_sistema') THEN
    ALTER TABLE public.config_chamadas_llm RENAME COLUMN prompt_sistema TO prompt_template;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='config_chamadas_llm' AND column_name='gavetas') THEN
    ALTER TABLE public.config_chamadas_llm RENAME COLUMN gavetas TO itens_produzidos;
  END IF;
END$$;

-- 3) Renames em historico_config_chamadas_llm
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='historico_config_chamadas_llm' AND column_name='config_id') THEN
    ALTER TABLE public.historico_config_chamadas_llm RENAME COLUMN config_id TO chave;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='historico_config_chamadas_llm' AND column_name='prompt_sistema') THEN
    ALTER TABLE public.historico_config_chamadas_llm RENAME COLUMN prompt_sistema TO prompt_template;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='historico_config_chamadas_llm' AND column_name='gavetas') THEN
    ALTER TABLE public.historico_config_chamadas_llm RENAME COLUMN gavetas TO itens_produzidos;
  END IF;
END$$;

-- 4) Adicionar colunas novas em config_chamadas_llm
ALTER TABLE public.config_chamadas_llm
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'global'
    CHECK (escopo IN ('global','nicho','tenant')),
  ADD COLUMN IF NOT EXISTS nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS custo_teto_diario numeric(10,2),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS posicao text NOT NULL DEFAULT 'turno'
    CHECK (posicao IN ('turno','cron')),
  ADD COLUMN IF NOT EXISTS schedule text,
  ADD COLUMN IF NOT EXISTS json_mode boolean NOT NULL DEFAULT false;

-- 5) Adicionar colunas equivalentes em histórico (preserva snapshot completo)
ALTER TABLE public.historico_config_chamadas_llm
  ADD COLUMN IF NOT EXISTS escopo text,
  ADD COLUMN IF NOT EXISTS nicho_id uuid,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS custo_teto_diario numeric(10,2),
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS posicao text,
  ADD COLUMN IF NOT EXISTS schedule text,
  ADD COLUMN IF NOT EXISTS json_mode boolean;

-- 6) Recriar função snapshot com nomes novos
CREATE OR REPLACE FUNCTION public.tg_config_chamadas_llm_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  INSERT INTO public.historico_config_chamadas_llm
    (chave, versao, modelo, temperatura, max_tokens, prompt_template, itens_produzidos,
     escopo, nicho_id, tenant_id, custo_teto_diario, notas, posicao, schedule, json_mode,
     alterado_em, alterado_por)
  VALUES
    (OLD.chave, OLD.versao, OLD.modelo, OLD.temperatura, OLD.max_tokens, OLD.prompt_template, OLD.itens_produzidos,
     OLD.escopo, OLD.nicho_id, OLD.tenant_id, OLD.custo_teto_diario, OLD.notas, OLD.posicao, OLD.schedule, OLD.json_mode,
     now(), NEW.atualizado_por);
  RETURN NEW;
END;
$func$;

-- 7) Recriar trigger
CREATE TRIGGER tg_config_chamadas_llm_snapshot
  BEFORE UPDATE ON public.config_chamadas_llm
  FOR EACH ROW EXECUTE FUNCTION public.tg_config_chamadas_llm_snapshot();

-- 8) Backfill: nada a fazer (default 'global' já cobre os 4 seeds)

-- 9) CHECK escopo_consistente
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'config_chamadas_llm_escopo_consistente') THEN
    ALTER TABLE public.config_chamadas_llm
      ADD CONSTRAINT config_chamadas_llm_escopo_consistente CHECK (
        (escopo='global' AND nicho_id IS NULL AND tenant_id IS NULL) OR
        (escopo='nicho'  AND nicho_id IS NOT NULL AND tenant_id IS NULL) OR
        (escopo='tenant' AND tenant_id IS NOT NULL)
      );
  END IF;
END$$;

-- 10) UNIQUE composto via UNIQUE INDEX (COALESCE não funciona em table-level UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS config_chamadas_llm_chave_escopo_versao_uniq
  ON public.config_chamadas_llm (
    chave,
    escopo,
    COALESCE(nicho_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    versao
  )
  WHERE deleted_at IS NULL;

-- 11) Índices de lookup
CREATE INDEX IF NOT EXISTS idx_config_chamadas_llm_lookup_chave_escopo
  ON public.config_chamadas_llm (chave, escopo, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_config_chamadas_llm_tenant
  ON public.config_chamadas_llm (tenant_id, chave)
  WHERE deleted_at IS NULL AND tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_config_chamadas_llm_nicho
  ON public.config_chamadas_llm (nicho_id, chave)
  WHERE deleted_at IS NULL AND nicho_id IS NOT NULL;

;

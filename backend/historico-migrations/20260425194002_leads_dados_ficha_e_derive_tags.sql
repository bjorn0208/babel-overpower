-- Fase 2: dados_ficha estruturada + derive_tags_for_lead
-- Separar dado bruto do indivíduo (ficha) de tag categórica derivada.

-- 1. Coluna dados_ficha (jsonb estruturado)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS dados_ficha jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.leads.dados_ficha IS
  'Dados estruturados do indivíduo (alta cardinalidade, não segmenta). Estrutura sugerida: data_nascimento, endereco{estado,cidade,cep}, email, telefone, renda_mensal, filhos[], dividas[], score_credito, profissao, estado_civil, genero. Tags derivadas (aniversariante, faixa_idade, estado, ...) são geradas automaticamente via derive_tags_for_lead.';

-- 2. tag_candidates ganha origem + dado_origem
ALTER TABLE public.tag_candidates
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'extraida',
  ADD COLUMN IF NOT EXISTS dado_origem text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tag_candidates_origem_check'
  ) THEN
    ALTER TABLE public.tag_candidates
      ADD CONSTRAINT tag_candidates_origem_check
      CHECK (origem IN ('extraida', 'derivada', 'manual'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_tag_candidates_dado_origem
  ON public.tag_candidates (dado_origem)
  WHERE origem = 'derivada';

-- 3. Função derive_tags_for_lead — gera tags categóricas a partir de dados_ficha
CREATE OR REPLACE FUNCTION public.derive_tags_for_lead(p_lead_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_dados jsonb;
  v_tags_atual text[];
  v_tags_derivadas text[] := '{}';
  v_tags_outras text[];
  v_data_nasc date;
  v_meses_pt text[] := ARRAY[
    'janeiro','fevereiro','marco','abril','maio','junho',
    'julho','agosto','setembro','outubro','novembro','dezembro'
  ];
  v_idade integer;
  v_estado text;
  v_cidade text;
  v_email text;
  v_dominio text;
  v_telefone text;
  v_ddd text;
  v_renda numeric;
  v_score integer;
  v_qtd_filhos integer;
  v_divida_total numeric;
  v_qtd_dividas integer;
  v_inst text;
BEGIN
  SELECT dados_ficha, COALESCE(tags, '{}')
    INTO v_dados, v_tags_atual
  FROM public.leads
  WHERE id = p_lead_id;

  IF v_dados IS NULL THEN
    RETURN 0;
  END IF;

  -- Aniversariante + idade
  IF v_dados ? 'data_nascimento' AND (v_dados->>'data_nascimento') ~ '^\d{4}-\d{2}-\d{2}' THEN
    v_data_nasc := (v_dados->>'data_nascimento')::date;
    v_tags_derivadas := array_append(v_tags_derivadas,
      'aniversariante:' || v_meses_pt[EXTRACT(MONTH FROM v_data_nasc)::int]);
    v_idade := EXTRACT(YEAR FROM age(v_data_nasc))::int;
    v_tags_derivadas := array_append(v_tags_derivadas,
      'faixa_idade:' || CASE
        WHEN v_idade < 25 THEN '18_24'
        WHEN v_idade < 35 THEN '25_34'
        WHEN v_idade < 45 THEN '35_44'
        WHEN v_idade < 55 THEN '45_54'
        WHEN v_idade < 65 THEN '55_64'
        ELSE '65_mais'
      END);
  END IF;

  -- Endereço (estado + cidade)
  v_estado := lower(coalesce(v_dados->'endereco'->>'estado', ''));
  IF v_estado <> '' THEN
    v_tags_derivadas := array_append(v_tags_derivadas, 'estado:' || regexp_replace(v_estado, '\s+', '_', 'g'));
  END IF;
  v_cidade := lower(coalesce(v_dados->'endereco'->>'cidade', ''));
  IF v_cidade <> '' THEN
    v_tags_derivadas := array_append(v_tags_derivadas, 'cidade:' || regexp_replace(v_cidade, '[^a-z0-9]+', '_', 'g'));
  END IF;

  -- Email → email_provider
  v_email := lower(coalesce(v_dados->>'email', ''));
  IF v_email <> '' AND position('@' in v_email) > 0 THEN
    v_dominio := split_part(v_email, '@', 2);
    v_dominio := regexp_replace(v_dominio, '\..*$', '', 'g');
    IF v_dominio <> '' THEN
      v_tags_derivadas := array_append(v_tags_derivadas, 'email_provider:' || v_dominio);
    END IF;
  END IF;

  -- Telefone → DDD (assume +55)
  v_telefone := regexp_replace(coalesce(v_dados->>'telefone', ''), '[^0-9]', '', 'g');
  IF length(v_telefone) >= 12 THEN
    v_ddd := substring(v_telefone, 3, 2);
    v_tags_derivadas := array_append(v_tags_derivadas, 'ddd:' || v_ddd);
  END IF;

  -- Renda → faixa
  IF v_dados ? 'renda_mensal' THEN
    v_renda := (v_dados->>'renda_mensal')::numeric;
    v_tags_derivadas := array_append(v_tags_derivadas,
      'renda_faixa:' || CASE
        WHEN v_renda < 1500 THEN 'ate_1500'
        WHEN v_renda < 3000 THEN '1500_3000'
        WHEN v_renda < 5000 THEN '3000_5000'
        WHEN v_renda < 10000 THEN '5000_10k'
        WHEN v_renda < 20000 THEN '10k_20k'
        ELSE '20k_mais'
      END);
  END IF;

  -- Score → faixa
  IF v_dados ? 'score_credito' THEN
    v_score := (v_dados->>'score_credito')::int;
    v_tags_derivadas := array_append(v_tags_derivadas,
      'score_faixa:' || CASE
        WHEN v_score < 300 THEN 'muito_baixo'
        WHEN v_score < 500 THEN 'baixo'
        WHEN v_score < 700 THEN 'medio'
        WHEN v_score < 850 THEN 'bom'
        ELSE 'otimo'
      END);
  END IF;

  -- Filhos
  IF v_dados ? 'filhos' AND jsonb_typeof(v_dados->'filhos') = 'array' THEN
    v_qtd_filhos := jsonb_array_length(v_dados->'filhos');
    IF v_qtd_filhos > 0 THEN
      v_tags_derivadas := array_append(v_tags_derivadas, 'tem_filhos:sim');
      v_tags_derivadas := array_append(v_tags_derivadas, 'qtd_filhos:' || v_qtd_filhos::text);
    END IF;
  END IF;

  -- Dívidas
  IF v_dados ? 'dividas' AND jsonb_typeof(v_dados->'dividas') = 'array' THEN
    v_qtd_dividas := jsonb_array_length(v_dados->'dividas');
    IF v_qtd_dividas > 0 THEN
      v_tags_derivadas := array_append(v_tags_derivadas, 'qtd_dividas:' || v_qtd_dividas::text);
      -- Por instituição
      FOR v_inst IN
        SELECT DISTINCT lower(regexp_replace(coalesce(d->>'instituicao', ''), '[^a-z0-9]+', '_', 'g'))
        FROM jsonb_array_elements(v_dados->'dividas') d
        WHERE d->>'instituicao' IS NOT NULL AND d->>'instituicao' <> ''
      LOOP
        v_tags_derivadas := array_append(v_tags_derivadas, 'tem_divida:' || v_inst);
      END LOOP;
      -- Total → faixa
      SELECT COALESCE(SUM((d->>'valor')::numeric), 0)
        INTO v_divida_total
      FROM jsonb_array_elements(v_dados->'dividas') d
      WHERE d->>'valor' IS NOT NULL;
      IF v_divida_total > 0 THEN
        v_tags_derivadas := array_append(v_tags_derivadas,
          'valor_divida_total:' || CASE
            WHEN v_divida_total < 1000 THEN 'ate_1k'
            WHEN v_divida_total < 5000 THEN '1k_5k'
            WHEN v_divida_total < 10000 THEN '5k_10k'
            WHEN v_divida_total < 50000 THEN '10k_50k'
            ELSE '50k_mais'
          END);
      END IF;
    END IF;
  END IF;

  -- Mantém tags atuais que NÃO são derivadas (sufixo prefixo "auto:")
  -- mas como não temos prefixo distintivo, simplificamos: mantemos tudo que NÃO casa
  -- com chaves derivadas conhecidas.
  WITH chaves_derivadas AS (
    SELECT split_part(t, ':', 1) AS k
    FROM unnest(ARRAY[
      'aniversariante','faixa_idade','estado','cidade',
      'email_provider','ddd','renda_faixa','score_faixa',
      'tem_filhos','qtd_filhos','tem_divida','qtd_dividas','valor_divida_total'
    ]) AS t
  )
  SELECT array_agg(t)
    INTO v_tags_outras
  FROM unnest(coalesce(v_tags_atual, '{}')) AS t
  WHERE split_part(t, ':', 1) NOT IN (SELECT k FROM chaves_derivadas);

  UPDATE public.leads
  SET tags = (
    SELECT COALESCE(array_agg(DISTINCT x), '{}')
    FROM unnest(coalesce(v_tags_outras, '{}') || v_tags_derivadas) AS x
  )
  WHERE id = p_lead_id;

  RETURN array_length(v_tags_derivadas, 1);
END;
$$;

COMMENT ON FUNCTION public.derive_tags_for_lead(uuid) IS
  'Gera tags derivadas (aniversariante, faixa_idade, estado, etc) a partir de leads.dados_ficha. Preserva tags existentes não-derivadas. Idempotente.';

-- 4. Trigger AFTER UPDATE OF dados_ficha
CREATE OR REPLACE FUNCTION public.trg_derive_tags_dados_ficha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.dados_ficha IS NOT DISTINCT FROM NEW.dados_ficha THEN
    RETURN NEW;
  END IF;
  PERFORM public.derive_tags_for_lead(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_tags_on_dados_ficha ON public.leads;
CREATE TRIGGER trg_derive_tags_on_dados_ficha
  AFTER INSERT OR UPDATE OF dados_ficha ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_derive_tags_dados_ficha();

COMMENT ON TRIGGER trg_derive_tags_on_dados_ficha ON public.leads IS
  'Quando dados_ficha muda, regenera tags derivadas (aniversariante, faixa_idade, estado, etc).';
;

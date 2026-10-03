-- Tabela de feriados (nacionais + estaduais + municipais)
CREATE TABLE IF NOT EXISTS public.feriados_brasil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  nome text NOT NULL,
  escopo text NOT NULL DEFAULT 'nacional' CHECK (escopo IN ('nacional','estadual','municipal')),
  uf text,
  municipio text,
  fonte text NOT NULL DEFAULT 'manual' CHECK (fonte IN ('manual','brasilapi','auto')),
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT feriados_brasil_unique UNIQUE (data, nome, escopo)
);

CREATE INDEX IF NOT EXISTS idx_feriados_data_ativo
  ON public.feriados_brasil(data) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_feriados_ano_ativo
  ON public.feriados_brasil((extract(year from data))) WHERE ativo = true;

ALTER TABLE public.feriados_brasil ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feriados_admin_all" ON public.feriados_brasil;
CREATE POLICY "feriados_admin_all" ON public.feriados_brasil
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND system_role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND system_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "feriados_read_all" ON public.feriados_brasil;
CREATE POLICY "feriados_read_all" ON public.feriados_brasil
  FOR SELECT TO authenticated
  USING (ativo = true);

CREATE OR REPLACE FUNCTION public.tg_feriados_brasil_updated_at()
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

DROP TRIGGER IF EXISTS trg_feriados_brasil_updated_at ON public.feriados_brasil;
CREATE TRIGGER trg_feriados_brasil_updated_at
  BEFORE UPDATE ON public.feriados_brasil
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_feriados_brasil_updated_at();

CREATE OR REPLACE FUNCTION public.eh_dia_util(p_data date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    extract(dow FROM p_data)::int NOT IN (0, 6)
    AND NOT EXISTS (
      SELECT 1 FROM public.feriados_brasil
      WHERE data = p_data AND ativo = true AND escopo = 'nacional'
    );
$$;

CREATE OR REPLACE FUNCTION public.proximo_dia_util(p_data date)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_data date := p_data;
  v_max_iter int := 30;
BEGIN
  WHILE NOT public.eh_dia_util(v_data) AND v_max_iter > 0 LOOP
    v_data := v_data + 1;
    v_max_iter := v_max_iter - 1;
  END LOOP;
  RETURN v_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.dia_util_do_mes(p_data_ref date, p_n integer)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref date := COALESCE(p_data_ref, current_date);
  v_data date := date_trunc('month', v_ref)::date;
  v_fim_mes date := (date_trunc('month', v_ref) + interval '1 month - 1 day')::date;
  v_count int := 0;
BEGIN
  IF p_n IS NULL OR p_n <= 0 THEN
    RETURN NULL;
  END IF;
  WHILE v_data <= v_fim_mes LOOP
    IF public.eh_dia_util(v_data) THEN
      v_count := v_count + 1;
      IF v_count = p_n THEN
        RETURN v_data;
      END IF;
    END IF;
    v_data := v_data + 1;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.proximo_recebimento(p_padrao text, p_ref date DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref date := COALESCE(p_ref, current_date);
  v_n int;
  v_dia int;
  v_data date;
  v_fim_mes date;
BEGIN
  IF p_padrao IS NULL OR length(p_padrao) = 0 THEN
    RETURN NULL;
  END IF;

  IF p_padrao LIKE 'dia_util_n:%' THEN
    v_n := substring(p_padrao FROM 12)::int;
    v_data := public.dia_util_do_mes(v_ref, v_n);
    IF v_data IS NULL OR v_data < v_ref THEN
      v_data := public.dia_util_do_mes((date_trunc('month', v_ref) + interval '1 month')::date, v_n);
    END IF;
    RETURN v_data;
  END IF;

  IF p_padrao LIKE 'dia_%' AND p_padrao NOT LIKE 'dia_util%' THEN
    v_dia := substring(p_padrao FROM 5)::int;
    IF v_dia < 1 OR v_dia > 31 THEN RETURN NULL; END IF;
    v_data := make_date(extract(year FROM v_ref)::int, extract(month FROM v_ref)::int, v_dia);
    IF v_data < v_ref THEN
      v_data := (date_trunc('month', v_ref) + interval '1 month')::date + (v_dia - 1);
    END IF;
    RETURN public.proximo_dia_util(v_data);
  END IF;

  IF p_padrao = 'fim_mes' THEN
    v_fim_mes := (date_trunc('month', v_ref) + interval '1 month - 1 day')::date;
    WHILE NOT public.eh_dia_util(v_fim_mes) LOOP
      v_fim_mes := v_fim_mes - 1;
    END LOOP;
    RETURN v_fim_mes;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON TABLE public.feriados_brasil IS
'Calendário de feriados (nacional/estadual/municipal). Populado via cron-sync-feriados (BrasilAPI) ou cadastro manual via curadoria. Funções eh_dia_util/proximo_dia_util/dia_util_do_mes/proximo_recebimento usam essa tabela.';
;

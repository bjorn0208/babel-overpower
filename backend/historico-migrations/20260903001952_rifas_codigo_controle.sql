-- Código legível por rifa pra controle/identificação (Theus 2026-09-02).
-- Formato R{DD}{MM}{AA}{NN}: R + dia+mes+ano(2 dig) BRT da criação + sequência
-- do dia por tenant (00,01,02...). Ex: R02092600 = 1a rifa criada em 02/09/26.
-- Campo NOVO e distinto de rifa_lista_disparo.tag (que é rótulo de lote de
-- CONTATO pro sistema de permissão de disparo, não tem relação com isso).

ALTER TABLE public.rifas
  ADD COLUMN IF NOT EXISTS codigo_controle text;

CREATE OR REPLACE FUNCTION public.fn_rifas_gerar_codigo_controle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefixo text;
  v_seq int;
BEGIN
  IF NEW.codigo_controle IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_prefixo := 'R' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DDMMYY');

  SELECT COALESCE(MAX((substring(codigo_controle from 8 for 2))::int), -1) + 1
    INTO v_seq
    FROM public.rifas
    WHERE tenant_id = NEW.tenant_id
      AND codigo_controle LIKE v_prefixo || '%';

  NEW.codigo_controle := v_prefixo || lpad(v_seq::text, 2, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rifas_gerar_codigo_controle ON public.rifas;
CREATE TRIGGER trg_rifas_gerar_codigo_controle
  BEFORE INSERT ON public.rifas
  FOR EACH ROW EXECUTE FUNCTION public.fn_rifas_gerar_codigo_controle();

-- Backfill das rifas existentes, mesma regra, por ordem de criação.
WITH numeradas AS (
  SELECT
    id,
    tenant_id,
    'R' || to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'DDMMYY') AS prefixo,
    row_number() OVER (
      PARTITION BY tenant_id, (created_at AT TIME ZONE 'America/Sao_Paulo')::date
      ORDER BY created_at
    ) - 1 AS seq
  FROM public.rifas
  WHERE codigo_controle IS NULL
)
UPDATE public.rifas r
SET codigo_controle = n.prefixo || lpad(n.seq::text, 2, '0')
FROM numeradas n
WHERE r.id = n.id;

ALTER TABLE public.rifas
  ADD CONSTRAINT rifas_codigo_controle_tenant_unique UNIQUE (tenant_id, codigo_controle);

;

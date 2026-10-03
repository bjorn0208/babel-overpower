
-- Extensão pra apelido case-insensitive
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

-- Coluna apelido em profiles (case-insensitive, único, nullable durante transição)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS apelido extensions.citext;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_apelido_unico'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_apelido_unico UNIQUE (apelido);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_apelido_ativo
  ON public.profiles (apelido)
  WHERE apelido IS NOT NULL;

COMMENT ON COLUMN public.profiles.apelido IS
  'Apelido único do usuário usado no login commandbar (case-insensitive). Pode ser NULL durante a migração dos users antigos.';

-- RPC pra resolver apelido em email. SECURITY DEFINER, sempre retorna ou NULL ou o email — caller deve equalizar timing chamando bcrypt mesmo em NULL.
CREATE OR REPLACE FUNCTION public.email_de_apelido(p_apelido text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email
  FROM public.profiles
  WHERE apelido = p_apelido::extensions.citext
    AND account_status = 'active'
  LIMIT 1;
  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.email_de_apelido(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_de_apelido(text) TO service_role;

-- Orçamento diário do Porteiro (anti-DoW). Centésimos de centavo (1 unidade = $0.0001).
CREATE TABLE IF NOT EXISTS public.orcamento_porteiro_diario (
  data date NOT NULL,
  escopo text NOT NULL CHECK (escopo IN ('global','ip')),
  identificador text NOT NULL DEFAULT 'global',
  gasto_centesimos integer NOT NULL DEFAULT 0,
  tentativas integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (data, escopo, identificador)
);

ALTER TABLE public.orcamento_porteiro_diario ENABLE ROW LEVEL SECURITY;

-- Sem policy — apenas service_role acessa via RPC. Intencional.

CREATE INDEX IF NOT EXISTS idx_orcamento_porteiro_data
  ON public.orcamento_porteiro_diario (data DESC);

COMMENT ON TABLE public.orcamento_porteiro_diario IS
  'Cap diário de gasto LLM do Porteiro (anti denial-of-wallet). Centésimos de centavo. Reset implícito por dia (chave primária inclui data).';

-- RPC pra reservar gasto e validar cap (IP + global) atomicamente.
-- Caps default: 5 centésimos/IP/dia (≈$0.05), 2000 centésimos/dia global (≈$2). Caller pode sobrescrever.
CREATE OR REPLACE FUNCTION public.reservar_orcamento_porteiro(
  p_ip text,
  p_custo_centesimos integer DEFAULT 1,
  p_cap_ip integer DEFAULT 500,
  p_cap_global integer DEFAULT 200000
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_data date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_gasto_ip integer;
  v_gasto_global integer;
BEGIN
  INSERT INTO public.orcamento_porteiro_diario (data, escopo, identificador, gasto_centesimos, tentativas)
  VALUES (v_data, 'ip', p_ip, p_custo_centesimos, 1)
  ON CONFLICT (data, escopo, identificador) DO UPDATE
    SET gasto_centesimos = public.orcamento_porteiro_diario.gasto_centesimos + EXCLUDED.gasto_centesimos,
        tentativas = public.orcamento_porteiro_diario.tentativas + 1,
        atualizado_em = now()
  RETURNING gasto_centesimos INTO v_gasto_ip;

  INSERT INTO public.orcamento_porteiro_diario (data, escopo, identificador, gasto_centesimos, tentativas)
  VALUES (v_data, 'global', 'global', p_custo_centesimos, 1)
  ON CONFLICT (data, escopo, identificador) DO UPDATE
    SET gasto_centesimos = public.orcamento_porteiro_diario.gasto_centesimos + EXCLUDED.gasto_centesimos,
        tentativas = public.orcamento_porteiro_diario.tentativas + 1,
        atualizado_em = now()
  RETURNING gasto_centesimos INTO v_gasto_global;

  RETURN v_gasto_ip <= p_cap_ip AND v_gasto_global <= p_cap_global;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_orcamento_porteiro(text,integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservar_orcamento_porteiro(text,integer,integer,integer) TO service_role;

;

CREATE TABLE IF NOT EXISTS public.apis_externas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  url_base text NOT NULL,
  requer_auth boolean NOT NULL DEFAULT false,
  auth_storage text,
  edge_associada text,
  frequencia text NOT NULL DEFAULT 'manual' CHECK (frequencia IN ('manual','cron','sob_demanda','hibrido')),
  categoria text,
  ativo boolean NOT NULL DEFAULT true,
  ultima_execucao_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.apis_externas IS
  'Inventário das APIs externas que a plataforma chama. Cada linha aponta pra uma edge function que centraliza a chamada no servidor (regra: zero fetch externo do client).';

ALTER TABLE public.apis_externas ENABLE ROW LEVEL SECURITY;

CREATE POLICY apis_externas_admin_all ON public.apis_externas
  FOR ALL TO authenticated
  USING (public._eh_platform_admin())
  WITH CHECK (public._eh_platform_admin());

CREATE POLICY apis_externas_authenticated_read ON public.apis_externas
  FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS apis_externas_categoria_idx ON public.apis_externas (categoria);
CREATE INDEX IF NOT EXISTS apis_externas_ativo_idx ON public.apis_externas (ativo) WHERE ativo = true;

INSERT INTO public.apis_externas (slug, nome, descricao, url_base, requer_auth, auth_storage, edge_associada, frequencia, categoria)
VALUES
  ('brasilapi-feriados', 'BrasilAPI · Feriados',
   'Feriados nacionais do Brasil pra cálculo de dia útil. Popula tabela feriados_brasil. Cron anual (1º janeiro 6h UTC) + botão manual no PainelCalendario.',
   'https://brasilapi.com.br/api/feriados/v1/{ano}', false, NULL,
   'cron-sync-feriados', 'hibrido', 'calendario'),
  ('awesomeapi-cotacao', 'AwesomeAPI · Cotação USD→BRL',
   'Cotação USD→BRL pra conversão de custo no PainelCustos. Atualiza platform_settings.usd_brl_cotacao. Manual via botão Câmbio.',
   'https://economia.awesomeapi.com.br/json/last/USD-BRL', false, NULL,
   'cotacao-usd-brl', 'manual', 'financeiro')
ON CONFLICT (slug) DO NOTHING;
;

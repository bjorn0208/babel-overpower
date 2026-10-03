-- App Consulta F3 — params extras por serviço (uf, insumo, etc — vêm do settings da API)
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS params_api jsonb NOT NULL DEFAULT '{}';

-- Guarda o settings (campos exigidos) de cada tipo, alimentado do /service/{id}
ALTER TABLE public.consultas_tipos
  ADD COLUMN IF NOT EXISTS settings_api jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.consultas.params_api IS 'Params extras exigidos pelo serviço da API (ex: uf, insumo). Mesclados no body do activity/create.';
COMMENT ON COLUMN public.consultas_tipos.settings_api IS 'settings do /service/{id} da API — define campos obrigatórios por tipo (uf, tipo_documento, insumo...).';

-- Seed: settings reais dos tipos 20 e 23
UPDATE public.consultas_tipos SET settings_api = '{"uf":"required","insumo":"array","insumo.*":"in:acao,scpc_pf","documento":"required|cpf"}'::jsonb WHERE codigo_api = '20';
UPDATE public.consultas_tipos SET settings_api = '{"uf":"required","insumo":"array","documento":"required|cnpj"}'::jsonb WHERE codigo_api = '23';
;

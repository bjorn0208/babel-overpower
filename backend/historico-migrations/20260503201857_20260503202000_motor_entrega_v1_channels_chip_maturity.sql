-- Motor de entrega v1 · chip maturity em channels
-- DEC-028 (cravada em 2026-05-03)
-- Risco: 14 canais ativos em produção; default conservador para chip_connected_since IS NULL
-- DDL puro — zero impacto em linhas existentes

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS chip_connected_since date,
  ADD COLUMN IF NOT EXISTS chip_maturity_tier text,
  ADD COLUMN IF NOT EXISTS max_messages_per_hour_override integer,
  ADD COLUMN IF NOT EXISTS chip_observacao text;

-- Constraint do tier (alinhado a DEC-028 §tabela)
ALTER TABLE public.channels
  ADD CONSTRAINT channels_chip_maturity_tier_check
  CHECK (chip_maturity_tier IS NULL OR chip_maturity_tier IN ('novo','aquecendo','consolidando','maduro'));

-- Constraint do override (sanidade: 10–800 msgs/h conforme DEC-028)
ALTER TABLE public.channels
  ADD CONSTRAINT channels_max_msg_hour_check
  CHECK (max_messages_per_hour_override IS NULL OR (max_messages_per_hour_override BETWEEN 10 AND 800));

-- Comentários de autodocumentação (pt-BR)
COMMENT ON COLUMN public.channels.chip_connected_since IS 'Data informada pelo tenant em que o número foi conectado ao WhatsApp; null = desconhecido (default conservador aplica)';
COMMENT ON COLUMN public.channels.chip_maturity_tier IS 'Tier computado: novo (0-2d), aquecendo (3-6d), consolidando (7-14d), maduro (>=15d). Pode ser sobrescrito pelo tenant via UI';
COMMENT ON COLUMN public.channels.max_messages_per_hour_override IS 'Override do tenant quando chip_connected_since >= 30 dias; null = usar projeção do tier';
COMMENT ON COLUMN public.channels.chip_observacao IS 'Campo livre do tenant (ex: "chip migrado em 2026-04-30")';

-- Policies: channels já tem RLS com cmd=ALL, SELECT e UPDATE cobrindo todas as colunas
-- implicitamente (não são column-specific). As 4 colunas novas ficam automaticamente
-- cobertas pelas policies existentes (user_read_own_channel, user_update_own_channel,
-- admin_all_channels). Nenhuma alteração de policy necessária.
;

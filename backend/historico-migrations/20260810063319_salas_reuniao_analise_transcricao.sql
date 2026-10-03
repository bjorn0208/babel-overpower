-- Análise da transcrição da call vira dado: assunto, resumo e tópicos
-- extraídos por IA (edge analisar-reuniao). Colunas na própria sala (1:1).
-- RLS já cobre via policy salas_reuniao_tenant_all (FOR ALL).
ALTER TABLE public.salas_reuniao
  ADD COLUMN IF NOT EXISTS assunto text,
  ADD COLUMN IF NOT EXISTS resumo text,
  ADD COLUMN IF NOT EXISTS topicos jsonb,
  ADD COLUMN IF NOT EXISTS analisada_em timestamptz;

COMMENT ON COLUMN public.salas_reuniao.assunto IS 'Assunto principal da call, extraído por IA da transcrição';
COMMENT ON COLUMN public.salas_reuniao.resumo IS 'Resumo da call em pt-BR, extraído por IA';
COMMENT ON COLUMN public.salas_reuniao.topicos IS 'JSON { topicos: [], decisoes: [], pendencias: [] } extraído por IA';
COMMENT ON COLUMN public.salas_reuniao.analisada_em IS 'Quando a análise por IA foi gerada (null = nunca analisada)';

-- down (referência):
-- ALTER TABLE public.salas_reuniao DROP COLUMN IF EXISTS assunto, DROP COLUMN IF EXISTS resumo, DROP COLUMN IF EXISTS topicos, DROP COLUMN IF EXISTS analisada_em;
;

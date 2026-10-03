-- Enxuga a publicação Realtime: remove 3 tabelas de escrita altíssima que
-- NINGUÉM assina no frontend (confirmado por varredura de postgres_changes).
-- O WAL decoder do Realtime processava cada escrita delas à toa:
--   estado_digitacao  — UPSERT a cada presença/digitação do webhook
--   prancheta         — UPSERT a cada turno do agente
--   prompts_mensagem  — INSERT a cada turno (tabela de 224 MB, só platform_admin lê)
-- Reduz IO/CPU contínuo do decoder de WAL sem afetar nenhuma tela.
-- Reversível: ALTER PUBLICATION supabase_realtime ADD TABLE public.<tabela>;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='estado_digitacao') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.estado_digitacao';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='prancheta') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.prancheta';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='prompts_mensagem') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.prompts_mensagem';
  END IF;
END $$;
;

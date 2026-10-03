-- Realtime pro app Financeiro: lista de movimentos e aba Conversa atualizam sozinhas.
-- RLS já protege ambas (owner_id / via conversa do owner).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='movimentos_financeiros') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.movimentos_financeiros;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='mentor_mensagens') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mentor_mensagens;
  END IF;
END $$;
;

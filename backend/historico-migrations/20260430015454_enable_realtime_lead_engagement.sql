-- Habilita realtime em lead_engagement para que a ficha atualize sozinha
-- quando engagement-aggregator (fire-and-forget pós-turno) UPSERTa nivel/score.
-- Sem isso, badge no topo da ficha (🔥/🌡️/❄️) e bloco "Engajamento do lead" na
-- aba Mente ficam congelados no estado do load inicial.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lead_engagement'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_engagement;
  END IF;
END$$;

-- REPLICA IDENTITY FULL pra realtime entregar payload.new completo no UPDATE
ALTER TABLE public.lead_engagement REPLICA IDENTITY FULL;
;

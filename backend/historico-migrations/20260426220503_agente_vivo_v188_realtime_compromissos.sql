-- AbaEstagio passou a escutar realtime de compromissos · sem isso tabela ficava fora da publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'compromissos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.compromissos;
  END IF;
END $$;

ALTER TABLE public.compromissos REPLICA IDENTITY FULL;
;

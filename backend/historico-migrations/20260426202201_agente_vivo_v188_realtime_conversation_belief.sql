-- Habilita realtime para conversation_belief.
-- FichaPensamentoAgente (FE) subscreve via supabase.channel().on('postgres_changes')
-- mas a tabela não estava na publication supabase_realtime · banco não emitia INSERT/UPDATE.
-- Resultado: pensamento do agente, belief_historico e compromissos só apareciam após refresh manual.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_belief'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_belief;
  END IF;
END $$;

-- REPLICA IDENTITY FULL garante que UPDATE traga TODOS os campos no payload do realtime
-- (sem isso, só PK vem · FE não consegue popular o belief novo direto pelo payload).
ALTER TABLE public.conversation_belief REPLICA IDENTITY FULL;
;

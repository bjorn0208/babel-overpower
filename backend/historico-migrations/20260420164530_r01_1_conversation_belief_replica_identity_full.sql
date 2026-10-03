-- UP: habilita REPLICA IDENTITY FULL em conversation_belief
-- Necessário para Supabase Realtime emitir payload.new completo no UPDATE
-- Trade-off: WAL ligeiramente maior (row inteira vs só PK por UPDATE)
-- Aceitável: tabela de working memory, 1 row/conversa, UPDATE 1x por turno
ALTER TABLE public.conversation_belief REPLICA IDENTITY FULL;
;

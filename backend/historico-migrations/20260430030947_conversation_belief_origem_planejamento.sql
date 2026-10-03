-- DEC-017 · marca turnos de belief que vieram de planejamento autônomo
-- (cron-sweep + LLM planejador) vs turnos de fala normal. UI da ficha distingue
-- via ícone (ampulheta vs bolha de fala).
ALTER TABLE public.conversation_belief
  ADD COLUMN IF NOT EXISTS origem_planejamento text NULL;

COMMENT ON COLUMN public.conversation_belief.origem_planejamento IS
  'Marca turnos de belief autônomos (sem fala do lead). NULL = turno normal de
   conversa. ''trigger_temporal'' = belief atualizado por planejar-retomada quando
   cron acordou conversa em silêncio (DEC-017).';
;

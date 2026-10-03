-- Adiciona estado de digitação do AGENTE (separado do is_typing que é do lead)
-- e publica a tabela no realtime pra UI do /atendimento mostrar "digitando..."
-- nos dois sentidos (lead → agente e agente → lead).

ALTER TABLE public.estado_digitacao
  ADD COLUMN IF NOT EXISTS agente_digitando boolean NOT NULL DEFAULT false;

ALTER TABLE public.estado_digitacao
  ADD COLUMN IF NOT EXISTS agente_digitando_at timestamptz;

COMMENT ON COLUMN public.estado_digitacao.is_typing IS 'Lead está digitando no WhatsApp (presence event do Z-API).';
COMMENT ON COLUMN public.estado_digitacao.agente_digitando IS 'Agente está com bolha em janela delayTyping da Z-API (UI mostra "digitando" pro humano que acompanha).';
COMMENT ON COLUMN public.estado_digitacao.agente_digitando_at IS 'Quando agente_digitando virou true (pra timeout defensivo de 30s no front).';

-- REPLICA IDENTITY FULL garante que UPDATE pelo realtime entregue carga.new com TODAS as colunas
-- (sem isso, supabase-js só repassa colunas mudadas + PK, e o front precisa do estado completo).
ALTER TABLE public.estado_digitacao REPLICA IDENTITY FULL;

-- Publica no realtime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='estado_digitacao'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.estado_digitacao;
  END IF;
END $$;
;

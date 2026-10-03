-- A7: categoriza anexos de mensagens automaticamente via trigger BEFORE INSERT
-- Categorias: comprovante_pagamento, contrato, documento_pessoal, foto_produto, outro
-- Tier 1 (regex/heurística). Tier 2 (cron LLM tier 2) deferido.

ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS categoria_anexo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mensagens_categoria_anexo_check'
  ) THEN
    ALTER TABLE public.mensagens
      ADD CONSTRAINT mensagens_categoria_anexo_check
      CHECK (categoria_anexo IS NULL OR categoria_anexo IN ('comprovante_pagamento','contrato','documento_pessoal','foto_produto','outro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mensagens_categoria_anexo_idx
  ON public.mensagens(conversation_id, categoria_anexo)
  WHERE categoria_anexo IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_categorizar_anexo_mensagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  legenda text := COALESCE(NEW.content, '');
  tem_midia boolean := false;
BEGIN
  -- Detecta presença de mídia em qualquer chave plausível da carga jsonb
  IF NEW.carga IS NOT NULL THEN
    tem_midia := (NEW.carga ? 'media_url')
              OR (NEW.carga ? 'midia_url')
              OR (NEW.carga ? 'mediaUrl')
              OR (NEW.carga ? 'attachment_url')
              OR (NEW.carga ? 'image')
              OR (NEW.carga ? 'document')
              OR (NEW.carga ? 'audio')
              OR (NEW.carga ? 'video')
              OR (NEW.carga ? 'file_url');
  END IF;

  -- Se não tem mídia, não categoriza (fica NULL)
  IF NOT tem_midia THEN
    RETURN NEW;
  END IF;

  -- Só atribui se vier NULL (permite override manual)
  IF NEW.categoria_anexo IS NULL THEN
    NEW.categoria_anexo := CASE
      WHEN legenda ~* '(comprovante|pix|paguei|pago|pagamento|transfer[eê]ncia|recibo|ted|nota fiscal|nf-?e|boleto)' THEN 'comprovante_pagamento'
      WHEN legenda ~* '(contrato|proposta|acordo|aditivo|termo de ades[aã]o)' THEN 'contrato'
      WHEN legenda ~* '(\\brg\\b|\\bcpf\\b|\\bcnh\\b|identidade|comprovante de resid[eê]ncia|comprovante endere[cç]o|carteira)' THEN 'documento_pessoal'
      WHEN legenda ~* '(foto|imagem|print|screenshot|tela do)' THEN 'foto_produto'
      ELSE 'outro'
    END;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_categorizar_anexo_mensagem ON public.mensagens;
CREATE TRIGGER trg_categorizar_anexo_mensagem
  BEFORE INSERT ON public.mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_categorizar_anexo_mensagem();

COMMENT ON COLUMN public.mensagens.categoria_anexo IS
  'Categoria do anexo de mídia (preenchido automaticamente por trigger BEFORE INSERT). Valores: comprovante_pagamento, contrato, documento_pessoal, foto_produto, outro. NULL = mensagem sem mídia.';
;

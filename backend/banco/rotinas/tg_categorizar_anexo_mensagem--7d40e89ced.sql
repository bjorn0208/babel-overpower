CREATE OR REPLACE FUNCTION public.tg_categorizar_anexo_mensagem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$


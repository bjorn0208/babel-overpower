CREATE OR REPLACE FUNCTION public.avisar_evento_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_titulo text := COALESCE(NEW.titulo, NEW.nome_template, 'Contrato');
BEGIN
  -- Contrato assinado (assinado_em: NULL -> timestamp)
  IF NEW.assinado_em IS NOT NULL AND OLD.assinado_em IS NULL THEN
    IF NEW.tenant_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, tipo, icone, titulo, mensagem, acao, acao_label)
      VALUES (
        NEW.tenant_id, 'contrato_assinado', 'check',
        'Contrato assinado',
        v_titulo || ' foi assinado pelo cliente.',
        CASE WHEN NEW.conversa_id IS NOT NULL THEN 'conversas' END,
        CASE WHEN NEW.conversa_id IS NOT NULL THEN 'Abrir conversa' END
      );
    END IF;
    IF NEW.conversa_id IS NOT NULL THEN
      INSERT INTO public.mensagens (conversation_id, role, content, carga)
      VALUES (
        NEW.conversa_id, 'system', '[CONTRATO_ASSINADO]',
        jsonb_build_object('tipo_marco', 'contrato_assinado', 'contrato_id', NEW.id, 'titulo', v_titulo)
      );
    END IF;
  END IF;

  -- Comprovante enviado (url_comprovante_pagamento: NULL -> url)
  IF NEW.url_comprovante_pagamento IS NOT NULL AND OLD.url_comprovante_pagamento IS NULL THEN
    IF NEW.tenant_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, tipo, icone, titulo, mensagem, acao, acao_label)
      VALUES (
        NEW.tenant_id, 'comprovante_enviado', 'doc',
        'Comprovante enviado',
        'O cliente enviou o comprovante de pagamento de ' || v_titulo || '.',
        CASE WHEN NEW.conversa_id IS NOT NULL THEN 'conversas' END,
        CASE WHEN NEW.conversa_id IS NOT NULL THEN 'Abrir conversa' END
      );
    END IF;
    IF NEW.conversa_id IS NOT NULL THEN
      INSERT INTO public.mensagens (conversation_id, role, content, carga)
      VALUES (
        NEW.conversa_id, 'system', '[COMPROVANTE_ENVIADO]',
        jsonb_build_object('tipo_marco', 'comprovante_enviado', 'contrato_id', NEW.id, 'titulo', v_titulo)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.processar_aprovacao_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_plano public.loja_planos%ROWTYPE;
BEGIN
  IF NEW.status != 'aprovado' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprovado' THEN RETURN NEW; END IF;

  IF NEW.tipo = 'plano' THEN
    SELECT * INTO v_plano FROM public.loja_planos WHERE id = NEW.item_id;
    IF v_plano.id IS NOT NULL THEN
      INSERT INTO public.assinaturas_usuario (
        user_id, plano_id, plano_nome, preco, max_conversas, max_ciclos_por_conversa,
        max_storage_bytes, data_inicio, data_expiracao, conversas_usadas, status
      ) VALUES (
        NEW.user_id, NEW.item_id, NEW.item_nome, NEW.item_preco,
        COALESCE(v_plano.max_conversas, 1000), COALESCE(v_plano.max_ciclos_por_conversa, 50),
        209715200, now(), now() + (COALESCE(v_plano.dias_expiracao, 30) || ' days')::interval, 0, 'ativa'
      )
      ON CONFLICT (user_id) DO UPDATE SET
        plano_id = EXCLUDED.plano_id,
        plano_nome = EXCLUDED.plano_nome,
        preco = EXCLUDED.preco,
        max_conversas = EXCLUDED.max_conversas,
        max_ciclos_por_conversa = EXCLUDED.max_ciclos_por_conversa,
        max_storage_bytes = EXCLUDED.max_storage_bytes,
        data_inicio = EXCLUDED.data_inicio,
        data_expiracao = EXCLUDED.data_expiracao,
        conversas_usadas = 0,
        status = 'ativa',
        updated_at = now();
    END IF;
  END IF;

  IF NEW.tipo = 'plus' THEN
    UPDATE public.profiles SET multinivel_ativo = true WHERE id = NEW.user_id;
  END IF;

  IF NEW.tipo = 'pacote_extra' THEN
    UPDATE public.assinaturas_usuario
    SET max_conversas = max_conversas + COALESCE((SELECT conversas FROM public.loja_pacotes_extra WHERE id = NEW.item_id), 500),
        updated_at = now()
    WHERE user_id = NEW.user_id AND status IN ('active','ativa');
  END IF;

  IF NEW.tipo = 'implantacao' THEN
    UPDATE public.profiles SET is_active = true, account_status = 'ativo' WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$function$



-- Storage: 200MB fixo para todos os tenants, independente do plano
-- 200MB = 209715200 bytes

-- 1. Atualizar planos para 200MB
UPDATE public.store_planos SET max_storage_mb = 200;

-- 2. Atualizar todas as subscriptions ativas para 200MB
UPDATE public.user_subscriptions SET max_storage_bytes = 209715200 WHERE status = 'active';

-- 3. Atualizar processar_aprovacao_pedido para sempre usar 200MB fixo
CREATE OR REPLACE FUNCTION public.processar_aprovacao_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_plano public.store_planos%ROWTYPE; v_sub_id uuid;
BEGIN
  IF NEW.status != 'aprovado' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprovado' THEN RETURN NEW; END IF;

  IF NEW.tipo = 'plano' THEN
    SELECT * INTO v_plano FROM public.store_planos WHERE id = NEW.item_id;
    IF v_plano.id IS NOT NULL THEN
      SELECT id INTO v_sub_id FROM public.user_subscriptions
      WHERE user_id = NEW.user_id AND status = 'active' LIMIT 1;
      IF v_sub_id IS NOT NULL THEN
        UPDATE public.user_subscriptions SET
          plano_id = NEW.item_id, plano_nome = NEW.item_nome, preco = NEW.item_preco,
          max_conversas = COALESCE(v_plano.max_conversas, 1000),
          max_ciclos_por_conversa = COALESCE(v_plano.max_ciclos_por_conversa, 50),
          max_storage_bytes = 209715200,
          data_inicio = now(), data_expiracao = now() + (COALESCE(v_plano.dias_expiracao, 30) || ' days')::interval,
          conversas_usadas = 0, updated_at = now()
        WHERE id = v_sub_id;
      ELSE
        INSERT INTO public.user_subscriptions (
          user_id, plano_id, plano_nome, preco, max_conversas,
          max_ciclos_por_conversa, max_storage_bytes, data_inicio, data_expiracao, status
        ) VALUES (
          NEW.user_id, NEW.item_id, NEW.item_nome, NEW.item_preco,
          COALESCE(v_plano.max_conversas, 1000), COALESCE(v_plano.max_ciclos_por_conversa, 50),
          209715200,
          now(), now() + (COALESCE(v_plano.dias_expiracao, 30) || ' days')::interval, 'active'
        );
      END IF;
    END IF;
  END IF;

  IF NEW.tipo = 'plus' THEN
    UPDATE public.profiles SET multinivel_ativo = true WHERE id = NEW.user_id;
  END IF;

  IF NEW.tipo = 'pacote_extra' THEN
    UPDATE public.user_subscriptions
    SET max_conversas = max_conversas + COALESCE(
      (SELECT conversas FROM public.store_pacotes_extra WHERE id = NEW.item_id), 500
    ), updated_at = now()
    WHERE user_id = NEW.user_id AND status = 'active';
  END IF;

  IF NEW.tipo = 'implantacao' THEN
    UPDATE public.profiles SET is_active = true, account_status = 'ativo' WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_aprovacao_pedido ON public.purchase_orders;
CREATE TRIGGER trg_aprovacao_pedido
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.processar_aprovacao_pedido();

;

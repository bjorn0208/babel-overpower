
SET search_path = public, auth;

-- Sincroniza automaticamente dados_capturados do lead_cards em leads.tags[].
-- Toda vez que dados_capturados muda, recalcula as tags sync do lead.
-- Preserva tags manuais (adicionadas pelo operador) que nao seguem padrao `chave:valor`.

CREATE OR REPLACE FUNCTION public.sync_lead_tags_from_dados_capturados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_lead_id uuid;
  v_tags_manuais text[];
  v_tags_sync text[] := '{}';
  v_key text;
  v_value text;
  v_tag text;
BEGIN
  -- Se dados_capturados nao mudou, nada a fazer
  IF TG_OP = 'UPDATE' AND OLD.dados_capturados IS NOT DISTINCT FROM NEW.dados_capturados THEN
    RETURN NEW;
  END IF;

  -- Pega lead_id via conversation
  SELECT c.lead_id INTO v_lead_id
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Carrega tags atuais e separa MANUAIS (nao tem ':') das SYNC ('chave:valor' ou 'has_chave')
  SELECT COALESCE(
    array_agg(t) FILTER (WHERE t NOT LIKE '%:%' AND t NOT LIKE 'has\_%' ESCAPE '\'),
    '{}'
  )
  INTO v_tags_manuais
  FROM unnest(COALESCE((SELECT tags FROM public.leads WHERE id = v_lead_id), '{}')) AS t;

  -- Gera tags sync a partir de dados_capturados (pula chaves internas e valores invalidos)
  FOR v_key, v_value IN
    SELECT key, value::text
    FROM jsonb_each_text(COALESCE(NEW.dados_capturados, '{}'::jsonb))
  LOOP
    -- Pula chaves internas do motor
    CONTINUE WHEN v_key LIKE '\_%' ESCAPE '\';
    -- Pula valores vazios ou invalidos
    CONTINUE WHEN v_value IS NULL OR v_value = '' OR v_value IN ('null', 'undefined', 'none', 'nao_capturado');
    -- Pula valores muito grandes (vira ruido de tag)
    CONTINUE WHEN length(v_value) > 40;

    -- Normaliza valor: minusculas, troca espaco/simbolo por _
    v_value := lower(regexp_replace(v_value, '[^a-zA-Z0-9áéíóúâêôãõç]+', '_', 'g'));
    v_value := regexp_replace(v_value, '^_+|_+$', '', 'g');
    CONTINUE WHEN v_value = '';

    -- Tag formato: "chave:valor" (ex: tempo_negativacao:2_anos)
    -- Ou "has_chave" quando valor é "sim"/"true" (boolean-like)
    IF v_value IN ('sim', 'true', '1') THEN
      v_tag := 'has_' || v_key;
    ELSE
      v_tag := v_key || ':' || v_value;
    END IF;

    -- Adiciona sem duplicar
    IF NOT (v_tag = ANY(v_tags_sync)) THEN
      v_tags_sync := array_append(v_tags_sync, v_tag);
    END IF;
  END LOOP;

  -- Atualiza leads.tags = manuais + sync (dedup via concatenacao set)
  UPDATE public.leads
  SET tags = (
    SELECT COALESCE(array_agg(DISTINCT t), '{}')
    FROM unnest(COALESCE(v_tags_manuais, '{}') || v_tags_sync) AS t
  )
  WHERE id = v_lead_id;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_lead_tags ON public.lead_cards;
CREATE TRIGGER trg_sync_lead_tags
  AFTER INSERT OR UPDATE OF dados_capturados ON public.lead_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_tags_from_dados_capturados();

;

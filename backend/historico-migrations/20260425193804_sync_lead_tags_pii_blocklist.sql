-- Bloqueia geração de tags PII a partir de dados_capturados.
-- PII (nome, cpf, email, telefone, contrato_*) vai pra ficha do contato,
-- nunca pro vocabulário de tags (que serve pra segmentar campanhas).
CREATE OR REPLACE FUNCTION public.sync_lead_tags_from_dados_capturados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_lead_id uuid;
  v_tags_manuais text[];
  v_tags_sync text[] := '{}';
  v_key text;
  v_value text;
  v_tag text;
  -- Whitelist PII: chaves cujos valores são identificadores únicos do indivíduo
  -- (não segmentam campanhas). Ficam apenas em lead_memory ou dados_ficha.
  v_pii_keys text[] := ARRAY[
    'nome', 'nome_cliente', 'nome_lead', 'nome_completo',
    'cpf', 'rg',
    'email', 'contrato_email',
    'telefone', 'contrato_telefone',
    'contrato_token', 'contrato_nome', 'contrato_cpf',
    'contrato_endereco', 'contrato_data_assinatura',
    'agendamento_callback_at', 'agendamento_callback_motivo'
  ];
BEGIN
  -- Se dados_capturados nao mudou, nada a fazer
  IF TG_OP = 'UPDATE' AND OLD.dados_capturados IS NOT DISTINCT FROM NEW.dados_capturados THEN
    RETURN NEW;
  END IF;

  SELECT c.lead_id INTO v_lead_id
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Carrega tags atuais e separa MANUAIS das SYNC
  SELECT COALESCE(
    array_agg(t) FILTER (WHERE t NOT LIKE '%:%' AND t NOT LIKE 'has\_%' ESCAPE '\'),
    '{}'
  )
  INTO v_tags_manuais
  FROM unnest(COALESCE((SELECT tags FROM public.leads WHERE id = v_lead_id), '{}')) AS t;

  FOR v_key, v_value IN
    SELECT key, value::text
    FROM jsonb_each_text(COALESCE(NEW.dados_capturados, '{}'::jsonb))
  LOOP
    -- Pula chaves internas do motor
    CONTINUE WHEN v_key LIKE '\_%' ESCAPE '\';
    -- Pula chaves PII (vão pra ficha, não viram tag)
    CONTINUE WHEN v_key = ANY(v_pii_keys);
    -- Pula valores vazios ou invalidos
    CONTINUE WHEN v_value IS NULL OR v_value = '' OR v_value IN ('null', 'undefined', 'none', 'nao_capturado');
    CONTINUE WHEN length(v_value) > 40;

    v_value := lower(regexp_replace(v_value, '[^a-zA-Z0-9áéíóúâêôãõç]+', '_', 'g'));
    v_value := regexp_replace(v_value, '^_+|_+$', '', 'g');
    CONTINUE WHEN v_value = '';

    IF v_value IN ('sim', 'true', '1') THEN
      v_tag := 'has_' || v_key;
    ELSE
      v_tag := v_key || ':' || v_value;
    END IF;

    IF NOT (v_tag = ANY(v_tags_sync)) THEN
      v_tags_sync := array_append(v_tags_sync, v_tag);
    END IF;
  END LOOP;

  UPDATE public.leads
  SET tags = (
    SELECT COALESCE(array_agg(DISTINCT t), '{}')
    FROM unnest(COALESCE(v_tags_manuais, '{}') || v_tags_sync) AS t
  )
  WHERE id = v_lead_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_lead_tags_from_dados_capturados() IS
  'Sync leads.tags a partir de lead_cards.dados_capturados. PII (nome/cpf/email/etc) bloqueada — vai pra ficha, não vira tag.';
;

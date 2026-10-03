-- Fase 3 · Captura disciplinada
-- Refatora sync_lead_tags_from_dados_capturados com alias lookup + PII auto-trigger

CREATE OR REPLACE FUNCTION public.sync_lead_tags_from_dados_capturados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead_id   uuid;
  v_tenant_id uuid;
  v_tags_manuais text[];
  v_tags_sync    text[] := '{}';
  v_key   text;
  v_value text;
  v_tag   text;
  v_chave_canon text;
  v_valor_canon text;
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
  IF TG_OP = 'UPDATE' AND OLD.dados_capturados IS NOT DISTINCT FROM NEW.dados_capturados THEN
    RETURN NEW;
  END IF;

  SELECT c.lead_id, l.tenant_id
  INTO v_lead_id, v_tenant_id
  FROM public.conversations c
  JOIN public.leads l ON l.id = c.lead_id
  WHERE c.id = NEW.conversation_id
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Tags manuais: sem chave:valor e sem has_ prefix (preservar intactas)
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
    CONTINUE WHEN v_key LIKE '\_%' ESCAPE '\';
    CONTINUE WHEN v_key = ANY(v_pii_keys);
    CONTINUE WHEN v_value IS NULL OR v_value = '' OR v_value IN ('null', 'undefined', 'none', 'nao_capturado');
    CONTINUE WHEN length(v_value) > 40;

    v_value := lower(regexp_replace(v_value, '[^a-zA-Z0-9áéíóúâêôãõç]+', '_', 'g'));
    v_value := regexp_replace(v_value, '^_+|_+$', '', 'g');
    CONTINUE WHEN v_value = '';

    -- Fase 3: alias lookup → chave + valor canônicos
    -- Tenta match exato "chave:valor" primeiro; fallback em "chave" sem valor.
    v_chave_canon := NULL;
    v_valor_canon := NULL;
    SELECT tva.chave_canonica, tva.valor_canonico
    INTO v_chave_canon, v_valor_canon
    FROM public.tag_vocabulario_alias tva
    WHERE tva.alias IN (v_key || ':' || v_value, v_key)
      AND (
        tva.escopo = 'plataforma'
        OR (tva.escopo = 'nicho' AND tva.nicho_id IS NOT NULL)
        OR (tva.escopo = 'tenant' AND tva.tenant_id = v_tenant_id)
      )
    ORDER BY
      -- preferência: match exato chave:valor > só chave; tenant > nicho > plataforma
      (tva.alias = v_key || ':' || v_value) DESC,
      CASE tva.escopo WHEN 'tenant' THEN 0 WHEN 'nicho' THEN 1 ELSE 2 END
    LIMIT 1;

    IF v_chave_canon IS NOT NULL THEN
      v_key   := v_chave_canon;
      v_value := v_valor_canon;
    END IF;

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

  -- Fase 3: aciona cofre PII somente se alguma tag nova contém sequência de dígitos
  -- (11 ou 14 dígitos = possível CPF/CNPJ injetado via Gemma antes do mascaramento)
  IF EXISTS (
    SELECT 1 FROM unnest(v_tags_sync) AS t
    WHERE t ~ '\d{11}|\d{14}'
  ) THEN
    PERFORM public.extrair_pii_lead(v_lead_id);
  END IF;

  RETURN NEW;
END;
$$;
;

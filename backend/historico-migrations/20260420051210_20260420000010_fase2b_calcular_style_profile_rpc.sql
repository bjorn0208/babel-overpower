
-- Fase 2B — Decisão 10: RPC que calcula e persiste o style_profile do lead
-- Chamada pelo cron 1x/h (service_role bypassa RLS — sem policy de ownership necessária)
-- Usa índice idx_messages_conv (conversation_id, created_at) via JOIN conversations

CREATE OR REPLACE FUNCTION public.calcular_style_profile(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile         jsonb;
  v_total           integer := 0;
  v_total_chars     bigint  := 0;
  v_tamanho_medio   integer := 0;
  v_com_emoji       integer := 0;
  v_com_audio       integer := 0;
  v_usa_emoji       boolean := false;
  v_usa_audio       boolean := false;
  v_pct_audio       float   := 0.0;
  v_registro        text    := 'neutro';
  v_emojis_freq     text[]  := '{}';
BEGIN
  -- Agrega métricas das últimas 30 mensagens do lead (role='user', não deletadas)
  -- JOIN conversations para chegar ao lead_id sem coluna direta em messages
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(length(m.content)), 0)::bigint,
    COUNT(*) FILTER (
      WHERE m.content ~ '[😀-🙏🌀-🗿🚀-🛿🇦-🇿✂-➰Ⓜ-🉑]'
         OR m.payload->>'has_audio' = 'true'
         OR m.payload->>'media_type' = 'audio'
         OR (m.payload IS NOT NULL AND (m.payload->>'emoji_count')::int > 0)
    )::integer,
    COUNT(*) FILTER (
      WHERE m.payload->>'has_audio' = 'true'
         OR m.payload->>'media_type' = 'audio'
    )::integer
  INTO v_total, v_total_chars, v_com_emoji, v_com_audio
  FROM (
    SELECT m.content, m.payload
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE c.lead_id    = p_lead_id
      AND m.role       = 'user'
      AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 30
  ) m;

  -- Retorna NULL se não há mensagens suficientes (lead novo)
  IF v_total = 0 THEN
    RETURN NULL;
  END IF;

  -- Métricas derivadas
  v_tamanho_medio := (v_total_chars / v_total)::integer;
  v_usa_emoji     := (v_com_emoji::float / v_total) >= 0.20;
  v_usa_audio     := v_com_audio > 0;
  v_pct_audio     := ROUND((v_com_audio::float / v_total)::numeric, 2)::float;

  -- Heurística de registro (Decisão 9 — espelhamento leve/default)
  IF v_usa_emoji OR v_tamanho_medio < 60 THEN
    v_registro := 'informal';
  ELSIF v_tamanho_medio > 200 AND NOT v_usa_emoji THEN
    v_registro := 'formal';
  ELSE
    v_registro := 'neutro';
  END IF;

  -- Top 5 emojis distintos encontrados nas mensagens (extração pragmática)
  SELECT ARRAY(
    SELECT DISTINCT
           -- Extrai primeiro caractere que seja emoji (>= U+1F300)
           regexp_matches(m2.content,
             '[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0000FE00-\U0000FE0F]+',
             'g'
           )
    FROM public.messages m2
    JOIN public.conversations c2 ON c2.id = m2.conversation_id
    WHERE c2.lead_id    = p_lead_id
      AND m2.role       = 'user'
      AND m2.deleted_at IS NULL
      AND m2.content    ~ '[\U0001F300-\U0001FAFF\U00002600-\U000027BF]'
    ORDER BY 1
    LIMIT 5
  ) INTO v_emojis_freq;

  -- Monta o JSONB final
  v_profile := jsonb_build_object(
    'registro',          v_registro,
    'tamanho_medio_msg', v_tamanho_medio,
    'usa_emoji',         v_usa_emoji,
    'emojis_frequentes', v_emojis_freq,
    'usa_audio',         v_usa_audio,
    'pct_audio_vs_texto', v_pct_audio
  );

  -- Persiste em campaign_leads (todas as rows ativas do lead)
  UPDATE public.campaign_leads
     SET style_profile = v_profile
   WHERE lead_id = p_lead_id
     AND state   = 'ativo';

  RETURN v_profile;
END;
$$;

-- Permissão: apenas service_role chama (via cron). authenticated não precisa.
-- Revoga acesso público por precaução
REVOKE ALL ON FUNCTION public.calcular_style_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calcular_style_profile(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_style_profile(uuid) TO service_role;

;

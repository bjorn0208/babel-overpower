
-- 1. calcular_style_profile: style_profile → perfil_estilo (UPDATE em leads_campanha)
CREATE OR REPLACE FUNCTION public.calcular_style_profile(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    FROM public.mensagens m
    JOIN public.conversas c ON c.id = m.conversation_id
    WHERE c.lead_id    = p_lead_id
      AND m.role       = 'user'
      AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 30
  ) m;

  IF v_total = 0 THEN
    RETURN NULL;
  END IF;

  v_tamanho_medio := (v_total_chars / v_total)::integer;
  v_usa_emoji     := (v_com_emoji::float / v_total) >= 0.20;
  v_usa_audio     := v_com_audio > 0;
  v_pct_audio     := ROUND((v_com_audio::float / v_total)::numeric, 2)::float;

  IF v_usa_emoji OR v_tamanho_medio < 60 THEN
    v_registro := 'informal';
  ELSIF v_tamanho_medio > 200 AND NOT v_usa_emoji THEN
    v_registro := 'formal';
  ELSE
    v_registro := 'neutro';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT
           regexp_matches(m2.content,
             '[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0000FE00-\U0000FE0F]+',
             'g'
           )
    FROM public.mensagens m2
    JOIN public.conversas c2 ON c2.id = m2.conversation_id
    WHERE c2.lead_id    = p_lead_id
      AND m2.role       = 'user'
      AND m2.deleted_at IS NULL
      AND m2.content    ~ '[\U0001F300-\U0001FAFF\U00002600-\U000027BF]'
    ORDER BY 1
    LIMIT 5
  ) INTO v_emojis_freq;

  v_profile := jsonb_build_object(
    'registro',          v_registro,
    'tamanho_medio_msg', v_tamanho_medio,
    'usa_emoji',         v_usa_emoji,
    'emojis_frequentes', v_emojis_freq,
    'usa_audio',         v_usa_audio,
    'pct_audio_vs_texto', v_pct_audio
  );

  UPDATE public.leads_campanha
     SET perfil_estilo = v_profile
   WHERE lead_id = p_lead_id
     AND state   = 'ativo';

  RETURN v_profile;
END;
$function$;

-- 2. concluir_servico
CREATE OR REPLACE FUNCTION public.concluir_servico(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads
     SET location = 'base',
         fase_cliente = 'concluido',
         updated_at = now()
   WHERE id = p_lead_id AND deleted_at IS NULL;
END;
$function$;

-- 3. criar_cliente_manual (ordem correta: p_name, p_phone, p_product, p_email)
CREATE OR REPLACE FUNCTION public.criar_cliente_manual(p_name text, p_phone text, p_product text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid; v_agent_id uuid; v_lead_id uuid; v_conv_id uuid; v_token text; v_existing_lead_id uuid;
BEGIN
  SELECT COALESCE(p.parent_user_id, p.id) INTO v_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid());
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  SELECT l.id INTO v_existing_lead_id FROM public.leads l WHERE l.tenant_id = v_user_id AND l.phone = p_phone LIMIT 1;
  IF v_existing_lead_id IS NOT NULL THEN RAISE EXCEPTION 'Já existe um lead com este telefone'; END IF;
  SELECT ua.id INTO v_agent_id FROM public.agentes_usuario ua WHERE ua.user_id = v_user_id LIMIT 1;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.leads (tenant_id, name, nome_exibicao, phone, email, produto, fase_pipeline, fase_cliente, converted_at, tracking_token, origem_lead, temperatura_lead)
  VALUES (v_user_id, p_name, p_name, p_phone, p_email, COALESCE(p_product, ''), 'fechado', 'documentacao', now(), v_token, 'manual', 'quente') RETURNING id INTO v_lead_id;
  INSERT INTO public.conversas (tenant_id, lead_id, phone, channel, status, agent_enabled)
  VALUES (v_user_id, v_lead_id, p_phone, 'whatsapp', 'ativa', true) RETURNING id INTO v_conv_id;
  IF v_agent_id IS NOT NULL THEN
    INSERT INTO public.fichas_lead (conversation_id, lead_id, agent_id, ciclo, fase) VALUES (v_conv_id, v_lead_id, v_agent_id, 1, 'fechado');
  END IF;
  RETURN jsonb_build_object('lead_id', v_lead_id, 'conversation_id', v_conv_id, 'tracking_token', v_token);
END;
$function$;

-- 4. importar_contatos_para_base
CREATE OR REPLACE FUNCTION public.importar_contatos_para_base(p_tenant_id uuid, p_contatos jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_admin boolean := public.is_platform_admin();
  v_team boolean;
  v_count integer := 0;
  v_item jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND parent_user_id = p_tenant_id
  ) INTO v_team;
  IF NOT (p_tenant_id = v_caller OR v_admin OR v_team) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_contatos)
  LOOP
    INSERT INTO public.leads (tenant_id, name, nome_exibicao, phone, email, tags, location)
    VALUES (
      p_tenant_id,
      COALESCE(v_item->>'name', v_item->>'phone'),
      v_item->>'name',
      v_item->>'phone',
      v_item->>'email',
      CASE
        WHEN jsonb_typeof(v_item->'tags') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'tags'))
        ELSE NULL
      END,
      'base'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- 5. marcar_handoff_atendido
CREATE OR REPLACE FUNCTION public.marcar_handoff_atendido(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid; v_caller uuid := (select auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN RETURN; END IF;
  IF v_tenant != v_caller AND NOT public.is_platform_admin()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND parent_user_id = v_tenant) THEN
    RAISE EXCEPTION 'sem permissao pra atender handoff';
  END IF;
  UPDATE public.leads SET precisa_humano = false WHERE id = p_lead_id;
  UPDATE public.conversas SET visto_em = now(), status = 'humano', agent_enabled = false WHERE lead_id = p_lead_id;
END;
$function$;

-- 6. sincronizar_fase_pipeline_de_ficha_lead (TRIGGER)
CREATE OR REPLACE FUNCTION public.sincronizar_fase_pipeline_de_ficha_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_lead_id uuid;
  v_new_stage text;
BEGIN
  IF OLD.fase IS NOT DISTINCT FROM NEW.fase THEN
    RETURN NEW;
  END IF;

  SELECT lead_id INTO v_lead_id
  FROM public.conversas
  WHERE id = NEW.conversation_id
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.fase
    WHEN 'saudacao' THEN v_new_stage := 'novo';
    WHEN 'qualificacao' THEN v_new_stage := 'qualificando';
    WHEN 'apresentacao' THEN v_new_stage := 'apresentando';
    WHEN 'negociacao' THEN v_new_stage := 'negociando';
    WHEN 'fechado' THEN v_new_stage := NULL;
    ELSE v_new_stage := NULL;
  END CASE;

  IF v_new_stage IS NOT NULL THEN
    UPDATE public.leads
    SET fase_pipeline = v_new_stage
    WHERE id = v_lead_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 7. tornar_cliente_via_base
CREATE OR REPLACE FUNCTION public.tornar_cliente_via_base(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads
     SET location = 'cliente',
         converted_at = COALESCE(converted_at, now()),
         fase_cliente = COALESCE(fase_cliente, 'documentacao'),
         fase_pipeline = 'fechado',
         updated_at = now()
   WHERE id = p_lead_id AND deleted_at IS NULL;
END;
$function$;

;

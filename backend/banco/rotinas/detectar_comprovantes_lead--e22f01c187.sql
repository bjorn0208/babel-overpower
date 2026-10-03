CREATE OR REPLACE FUNCTION public.detectar_comprovantes_lead(p_janela_horas integer DEFAULT 24)
 RETURNS TABLE(criados integer, atualizados integer, sem_valor integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  r RECORD;
  v_valor_txt text;
  v_valor numeric;
  v_cobranca_id uuid;
  v_criados int := 0;
  v_atualizados int := 0;
  v_sem_valor int := 0;
BEGIN
  FOR r IN
    SELECT m.id AS msg_id, m.created_at AS msg_em,
           m.carga->>'media_descricao' AS descr, m.carga->>'media_url' AS url,
           cv.lead_id, cv.tenant_id
    FROM public.mensagens m
    JOIN public.conversas cv ON cv.id = m.conversation_id
    WHERE m.role = 'user'
      AND m.deleted_at IS NULL
      AND cv.lead_id IS NOT NULL
      AND m.created_at > now() - (p_janela_horas || ' hours')::interval
      AND coalesce(m.carga->>'media_descricao','') ILIKE '%comprovante%'
      AND NOT EXISTS (
        SELECT 1 FROM public.pagamentos_cliente pc WHERE pc.origem_mensagem_id = m.id
      )
  LOOP
    -- valor no formato brasileiro (R$ 1.234,56) ou simples (R$ 117)
    v_valor_txt := substring(r.descr from 'R\$\s*([0-9][0-9\.]*(?:,[0-9]{2})?)');
    IF v_valor_txt IS NULL THEN
      v_sem_valor := v_sem_valor + 1;
      CONTINUE;
    END IF;
    v_valor := replace(replace(v_valor_txt, '.', ''), ',', '.')::numeric;
    IF v_valor <= 0 OR v_valor > 1000000 THEN
      v_sem_valor := v_sem_valor + 1;
      CONTINUE;
    END IF;

    -- cobrança pendente do mesmo lead com o mesmo valor → anexa o comprovante nela
    SELECT pc.id INTO v_cobranca_id
    FROM public.pagamentos_cliente pc
    WHERE pc.tenant_id = r.tenant_id AND pc.lead_id = r.lead_id
      AND pc.status = 'pendente' AND pc.origem_mensagem_id IS NULL
      AND pc.valor BETWEEN v_valor - 0.01 AND v_valor + 0.01
    ORDER BY pc.created_at DESC LIMIT 1;

    IF v_cobranca_id IS NOT NULL THEN
      UPDATE public.pagamentos_cliente
      SET observacao = coalesce(observacao || ' · ', '')
            || 'comprovante recebido na conversa em '
            || to_char(r.msg_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
            || ' (detector automático — validar e baixar)',
          origem_mensagem_id = r.msg_id
      WHERE id = v_cobranca_id;
      v_atualizados := v_atualizados + 1;
    ELSE
      INSERT INTO public.pagamentos_cliente (
        tenant_id, lead_id, descricao, valor, data_vencimento, status,
        observacao, origem_mensagem_id
      ) VALUES (
        r.tenant_id, r.lead_id,
        'Comprovante de ' || to_char(v_valor, 'FM999G999G990D00') || ' recebido do cliente na conversa — validar e baixar',
        v_valor, (r.msg_em AT TIME ZONE 'America/Sao_Paulo')::date, 'pendente',
        'Detector automático · ' || coalesce('comprovante: ' || r.url, 'sem URL'),
        r.msg_id
      );
      v_criados := v_criados + 1;
    END IF;
    v_cobranca_id := NULL;
  END LOOP;

  RETURN QUERY SELECT v_criados, v_atualizados, v_sem_valor;
END;
$function$


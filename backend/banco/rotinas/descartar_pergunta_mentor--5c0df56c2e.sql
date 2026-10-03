CREATE OR REPLACE FUNCTION public.descartar_pergunta_mentor(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant   uuid;
  v_uid      uuid := (SELECT auth.uid());
  v_lead     uuid;
  v_conv     uuid;
  v_pergunta text;
  v_status   text;
BEGIN
  SELECT tenant_id, lead_id, conversation_id, pergunta, status_loop
    INTO v_tenant, v_lead, v_conv, v_pergunta, v_status
    FROM public.perguntas_sem_resposta
    WHERE id = p_id;

  IF v_tenant IS NULL OR v_tenant <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissao');
  END IF;

  -- Idempotente: já descartada não regrava memória (evita duplicar fato na ficha).
  IF v_status = 'descartada' THEN
    RETURN jsonb_build_object('ok', true, 'ja_descartada', true);
  END IF;

  UPDATE public.perguntas_sem_resposta
    SET status_loop  = 'descartada',
        resolvido    = true,
        resolvido_em = now()
    WHERE id = p_id;

  -- Memória na ficha do lead (dossiê). Prefixo legível e detectável pelo motor,
  -- que filtra estes fatos e instrui o Gate B1 a NÃO re-escalar o tema descartado.
  IF v_lead IS NOT NULL THEN
    INSERT INTO public.memoria_lead (
      lead_id, tenant_id, conversation_id, fato,
      categoria, relevancia, fonte, escopo, created_by, confianca
    ) VALUES (
      v_lead, v_tenant, v_conv,
      'Pergunta descartada pelo dono — o contato perguntou: "'
        || left(coalesce(v_pergunta, ''), 300)
        || '". O dono decidiu não responder isso. Se o contato perguntar de novo sobre este assunto, '
        || 'contorne com naturalidade e siga a conversa — não prometa verificar com ninguém nem escale de novo.',
      'historico_negociacao', 'alta', 'manual', 'longo', v_uid, 0.9
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$


-- Editar a resposta de uma pergunta já respondida.
-- Se a pergunta virou bloco em blocos_conhecimento, o content do bloco acompanha
-- (trigger trg_enqueue_embedding_conhecimento_upd reenfileira o embedding).
CREATE OR REPLACE FUNCTION public.editar_resposta_pergunta_mentor(p_id uuid, p_resposta text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_status text;
  v_bloco  uuid;
  v_gaveta text;
BEGIN
  SELECT tenant_id, status_loop, bloco_criado_id, gaveta_proposta
    INTO v_tenant, v_status, v_bloco, v_gaveta
    FROM public.perguntas_sem_resposta
    WHERE id = p_id;

  IF v_tenant IS NULL OR v_tenant <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissão');
  END IF;

  IF v_status NOT IN ('dono_respondeu', 'entregue_lead', 'virou_bloco') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'pergunta ainda não foi respondida');
  END IF;

  IF coalesce(trim(p_resposta), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'resposta vazia');
  END IF;

  UPDATE public.perguntas_sem_resposta
    SET resposta_do_dono = trim(p_resposta),
        respondida_em    = now(),
        respondida_por   = v_uid
    WHERE id = p_id;

  -- Bloco vinculado acompanha (apenas gaveta blocos_conhecimento — demais gavetas têm schemas próprios)
  IF v_bloco IS NOT NULL AND coalesce(v_gaveta, 'blocos_conhecimento') = 'blocos_conhecimento' THEN
    UPDATE public.blocos_conhecimento
      SET content = trim(p_resposta)
      WHERE id = v_bloco AND deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object('ok', true, 'bloco_atualizado', v_bloco IS NOT NULL);
END;
$$;

-- Excluir a pergunta de vez (o painel some; bloco de conhecimento vinculado permanece —
-- conhecimento é gerido na base, não aqui).
CREATE OR REPLACE FUNCTION public.excluir_pergunta_mentor(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_uid    uuid := (SELECT auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant
    FROM public.perguntas_sem_resposta
    WHERE id = p_id;

  IF v_tenant IS NULL OR v_tenant <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissão');
  END IF;

  DELETE FROM public.perguntas_sem_resposta WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.editar_resposta_pergunta_mentor(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.excluir_pergunta_mentor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.editar_resposta_pergunta_mentor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_pergunta_mentor(uuid) TO authenticated;
;

-- RPC pra o dono descartar uma pergunta do Mentor (não vira bloco/vetor).
-- Espelha responder_pergunta_mentor: SECURITY DEFINER bypassa a RLS (tabela só tem
-- SELECT pra tenant), valida ownership por auth.uid(), seta status_loop='descartada'.
-- NÃO dispara tg_disparar_retorno_lead (esse só dispara em 'dono_respondeu').
CREATE OR REPLACE FUNCTION public.descartar_pergunta_mentor(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_uid uuid := (SELECT auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.perguntas_sem_resposta WHERE id = p_id;
  IF v_tenant IS NULL OR v_tenant <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissao');
  END IF;

  UPDATE public.perguntas_sem_resposta
    SET status_loop = 'descartada',
        resolvido = true,
        resolvido_em = now()
    WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.descartar_pergunta_mentor(uuid) TO authenticated;
;

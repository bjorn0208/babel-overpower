
SET search_path = public, auth;

-- Funcao que transforma contratos_template.conteudo em chunks de knowledge_chunks
-- pra que o agente responda perguntas sobre clausulas do contrato via RAG.
-- Idempotente: checa title+agent_id antes de inserir.

CREATE OR REPLACE FUNCTION public.sync_contrato_template_para_rag(p_contrato_id uuid)
RETURNS TABLE(chunks_inseridos int, chunks_atualizados int, chunks_total int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_contrato record;
  v_agent_id uuid;
  v_conteudo text;
  v_partes text[];
  v_parte text;
  v_title text;
  v_inserted int := 0;
  v_updated int := 0;
  v_num int;
  v_prefix text;
BEGIN
  -- Carrega contrato + produto + agent
  SELECT ct.id, ct.nome, ct.conteudo, ct.produto_id, ct.user_id, p.nome AS produto_nome
  INTO v_contrato
  FROM public.contratos_template ct
  LEFT JOIN public.produtos p ON p.id = ct.produto_id
  WHERE ct.id = p_contrato_id AND ct.ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado ou inativo: %', p_contrato_id;
  END IF;

  -- Pega agent_id do tenant
  SELECT ua.id INTO v_agent_id
  FROM public.user_agents ua
  WHERE ua.user_id = v_contrato.user_id
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Tenant sem agente: %', v_contrato.user_id;
  END IF;

  v_conteudo := COALESCE(v_contrato.conteudo, '');
  IF v_conteudo = '' THEN
    RAISE EXCEPTION 'Contrato sem conteudo: %', p_contrato_id;
  END IF;

  -- Limpa placeholders (generifica pra o agente nao repetir dado do cliente)
  v_conteudo := regexp_replace(v_conteudo, '\[NOME_COMPLETO\]|\[NOME\]|\{NOME\}', '[NOME DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[CPF\]|\{CPF\}', '[CPF DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[EMAIL\]|\{EMAIL\}', '[EMAIL DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[TELEFONE\]|\{TELEFONE\}', '[TELEFONE DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[RG\]|\{RG\}', '[RG DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[CEP\]|\{CEP\}', '[CEP DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\{NOME_EMPRESA\}|\[NOME_EMPRESA\]', '[EMPRESA]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\{CNPJ\}|\[CNPJ\]', '[CNPJ DA EMPRESA]', 'gi');

  v_prefix := COALESCE(v_contrato.produto_nome, 'contrato') || ' — ';

  -- Tenta quebrar por "CLÁUSULA" / "Cláusula"
  v_partes := regexp_split_to_array(
    v_conteudo,
    '(?=CLÁUSULA\s+\d+|CLAUSULA\s+\d+|Cláusula\s+\d+|Clausula\s+\d+)'
  );

  -- Se tem 2+ cláusulas, usa esse split. Senão, fallback para paragrafo duplo.
  IF array_length(v_partes, 1) < 2 THEN
    v_partes := regexp_split_to_array(v_conteudo, '\n\s*\n');
  END IF;

  v_num := 0;
  FOREACH v_parte IN ARRAY v_partes LOOP
    v_parte := btrim(v_parte);
    IF length(v_parte) < 40 OR length(v_parte) > 2000 THEN
      CONTINUE;
    END IF;

    v_num := v_num + 1;

    -- Title: primeira linha truncada
    v_title := v_prefix || substring(split_part(v_parte, E'\n', 1) FROM 1 FOR 100);

    -- Tenta insert (idempotente via title + agent_id)
    INSERT INTO public.knowledge_chunks
      (agent_id, title, content, category, tags, tipo, escopo, ativo)
    VALUES (
      v_agent_id,
      v_title,
      v_parte,
      'contrato',
      ARRAY['contrato', 'clausula', COALESCE(v_contrato.produto_nome, 'geral')],
      'clausula_contrato',
      'tenant',
      true
    )
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    ELSE
      -- Se ja existia, atualiza conteudo (caso contrato tenha sido editado)
      UPDATE public.knowledge_chunks
      SET content = v_parte,
          tags = ARRAY['contrato', 'clausula', COALESCE(v_contrato.produto_nome, 'geral')]
      WHERE agent_id = v_agent_id AND title = v_title;
      IF FOUND THEN v_updated := v_updated + 1; END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_updated, v_num;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.sync_contrato_template_para_rag(uuid) TO authenticated, service_role;

;

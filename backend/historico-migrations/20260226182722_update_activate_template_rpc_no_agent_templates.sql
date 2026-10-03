
CREATE OR REPLACE FUNCTION activate_template(p_template_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tpl record;
  v_empresa_id uuid;
  v_agent_id uuid;
  v_produto record;
  v_prod_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode ativar templates';
  END IF;

  SELECT * INTO v_tpl FROM admin_templates WHERE id = p_template_id;
  IF v_tpl IS NULL THEN RAISE EXCEPTION 'Template nao encontrado'; END IF;

  -- Empresa
  INSERT INTO empresas (user_id, nome, cnpj, descricao, endereco, cidade, estado, tipo_presenca, site, instagram, whatsapp)
  VALUES (
    p_user_id,
    COALESCE(v_tpl.empresa_data->>'nome', 'Empresa'),
    COALESCE(v_tpl.empresa_data->>'cnpj', ''),
    COALESCE(v_tpl.empresa_data->>'descricao', ''),
    COALESCE(v_tpl.empresa_data->>'endereco', ''),
    COALESCE(v_tpl.empresa_data->>'cidade', ''),
    COALESCE(v_tpl.empresa_data->>'estado', ''),
    COALESCE(v_tpl.empresa_data->>'tipo_presenca', 'digital'),
    COALESCE(v_tpl.empresa_data->>'site', ''),
    COALESCE(v_tpl.empresa_data->>'instagram', ''),
    COALESCE(v_tpl.empresa_data->>'whatsapp', '')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,
    cnpj = EXCLUDED.cnpj, endereco = EXCLUDED.endereco,
    cidade = EXCLUDED.cidade, estado = EXCLUDED.estado,
    updated_at = now()
  RETURNING id INTO v_empresa_id;

  -- Agente direto em user_agents (sem agent_templates)
  INSERT INTO user_agents (user_id, nome_agente, identidade, fluxo, configuracao)
  VALUES (
    p_user_id,
    COALESCE(v_tpl.agente_identidade->>'nome', 'Agente'),
    v_tpl.agente_identidade,
    v_tpl.fluxo,
    v_tpl.agente_configuracao
  )
  ON CONFLICT (user_id) DO UPDATE SET
    nome_agente = EXCLUDED.nome_agente,
    identidade = EXCLUDED.identidade,
    fluxo = EXCLUDED.fluxo,
    configuracao = EXCLUDED.configuracao,
    template_id = NULL
  RETURNING id INTO v_agent_id;

  -- Produtos
  IF jsonb_array_length(COALESCE(v_tpl.produtos_data, '[]'::jsonb)) > 0 THEN
    FOR v_produto IN SELECT * FROM jsonb_array_elements(v_tpl.produtos_data) AS elem LOOP
      INSERT INTO produtos (user_id, nome, descricao, preco, prazo_entrega, garantia, chave_pix, criterios_qualificacao)
      VALUES (
        p_user_id,
        COALESCE(v_produto.elem->>'nome', 'Produto'),
        COALESCE(v_produto.elem->>'descricao', ''),
        COALESCE((v_produto.elem->>'preco')::numeric, 0),
        COALESCE(v_produto.elem->>'prazo_entrega', ''),
        COALESCE(v_produto.elem->>'garantia', ''),
        COALESCE(v_produto.elem->>'chave_pix', ''),
        COALESCE(v_produto.elem->>'criterios_qualificacao', '')
      ) RETURNING id INTO v_prod_id;

      IF v_produto.elem->'conhecimento' IS NOT NULL AND jsonb_array_length(COALESCE(v_produto.elem->'conhecimento', '[]'::jsonb)) > 0 THEN
        INSERT INTO produto_conhecimento (produto_id, tipo, titulo, conteudo, ordem)
        SELECT v_prod_id, COALESCE(c->>'tipo', 'conhecimento'), COALESCE(c->>'titulo', ''), COALESCE(c->>'conteudo', ''), (row_number() OVER ()) - 1
        FROM jsonb_array_elements(v_produto.elem->'conhecimento') AS c;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('agent_id', v_agent_id, 'empresa_id', v_empresa_id, 'template_nome', v_tpl.nome);
END;
$$;

;

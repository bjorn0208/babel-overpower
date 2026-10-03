CREATE OR REPLACE FUNCTION public.copy_produto_templates_to_new_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  tmpl RECORD;
  novo_produto_id uuid;
BEGIN
  IF NEW.nicho_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR tmpl IN
    SELECT * FROM produto_templates
    WHERE nicho_id = NEW.nicho_id AND ativo = true
  LOOP
    INSERT INTO produtos (user_id, nome, prazo_entrega, garantia)
    VALUES (NEW.id, tmpl.nome, tmpl.prazo_entrega, tmpl.garantia)
    RETURNING id INTO novo_produto_id;

    INSERT INTO produto_conhecimento (produto_id, tipo, titulo, conteudo, ordem)
    SELECT novo_produto_id, tipo, titulo, conteudo, ordem
    FROM produto_template_conhecimento
    WHERE produto_template_id = tmpl.id
    ORDER BY ordem NULLS LAST;

    INSERT INTO produto_midias (produto_id, arquivo_url, arquivo_nome, arquivo_tipo, descricao, ordem)
    SELECT novo_produto_id, arquivo_url, arquivo_nome, arquivo_tipo, descricao, ordem
    FROM produto_template_midias
    WHERE produto_template_id = tmpl.id
    ORDER BY ordem NULLS LAST;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_copy_produto_templates ON profiles;
CREATE TRIGGER trg_copy_produto_templates
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.copy_produto_templates_to_new_tenant();
;

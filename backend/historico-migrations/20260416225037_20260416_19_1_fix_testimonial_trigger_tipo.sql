-- Fix: trigger usava tipo='resposta_factual' que não existe no CHECK.
-- Tipos válidos: apresentacao, valor, resposta, pagamento, processo, clausula_contrato, contato, empresa.
-- 'resposta' é o mais adequado pra depoimento de cliente (prova social).

CREATE OR REPLACE FUNCTION public_testimonial_to_rag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_agent_id uuid;
  v_chunk_id uuid;
  v_content text;
BEGIN
  IF NEW.aprovado = true
     AND (TG_OP = 'INSERT' OR OLD.aprovado = false)
     AND NEW.rag_chunk_id IS NULL
  THEN
    SELECT id INTO v_agent_id
    FROM user_agents
    WHERE user_id = NEW.user_id AND is_active = true
    ORDER BY created_at DESC LIMIT 1;

    IF v_agent_id IS NOT NULL THEN
      v_content := NEW.autor_nome
        || CASE WHEN NEW.nota IS NOT NULL THEN ' (' || NEW.nota || '★)' ELSE '' END
        || ': ' || NEW.texto;

      INSERT INTO knowledge_chunks (agent_id, title, content, category, escopo, tipo, ativo)
      VALUES (
        v_agent_id,
        'Depoimento de ' || NEW.autor_nome,
        v_content,
        'prova_social',
        'tenant',
        'resposta',
        true
      ) RETURNING id INTO v_chunk_id;

      NEW.rag_chunk_id := v_chunk_id;
      NEW.aprovado_at := now();
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.aprovado = false
     AND OLD.aprovado = true
     AND OLD.rag_chunk_id IS NOT NULL
  THEN
    DELETE FROM knowledge_chunks WHERE id = OLD.rag_chunk_id;
    NEW.rag_chunk_id := NULL;
    NEW.aprovado_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;
;

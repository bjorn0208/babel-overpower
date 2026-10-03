CREATE OR REPLACE FUNCTION public.publico_depoimento_para_rag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_agent_id uuid;
  v_chunk_id uuid;
  v_content text;
BEGIN
  IF NEW.aprovado = true
     AND (TG_OP = 'INSERT' OR OLD.aprovado = false)
     AND NEW.rag_bloco_id IS NULL
  THEN
    SELECT id INTO v_agent_id
    FROM public.agentes_usuario
    WHERE user_id = NEW.user_id AND is_active = true
    ORDER BY created_at DESC LIMIT 1;

    IF v_agent_id IS NOT NULL THEN
      v_content := NEW.autor_nome
        || CASE WHEN NEW.nota IS NOT NULL THEN ' (' || NEW.nota || '★)' ELSE '' END
        || ': ' || NEW.texto;

      INSERT INTO public.blocos_conhecimento (agente_id, title, content, category, escopo, tipo, ativo)
      VALUES (
        v_agent_id,
        'Depoimento de ' || NEW.autor_nome,
        v_content,
        'prova_social',
        'tenant',
        'resposta',
        true
      ) RETURNING id INTO v_chunk_id;

      NEW.rag_bloco_id := v_chunk_id;
      NEW.aprovado_at := now();
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.aprovado = false
     AND OLD.aprovado = true
     AND OLD.rag_bloco_id IS NOT NULL
  THEN
    DELETE FROM public.blocos_conhecimento WHERE id = OLD.rag_bloco_id;
    NEW.rag_bloco_id := NULL;
    NEW.aprovado_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$


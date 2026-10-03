CREATE OR REPLACE FUNCTION public.limpar_antes_embedar(p_text text, p_cap_bytes integer DEFAULT 1500)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_resultado text;
  v_bytes_originais int;
  v_bytes_finais int;
BEGIN
  v_resultado := p_text;
  v_bytes_originais := length(p_text);

  -- Remove linhas com >5 underscores ou hifens consecutivos (separadores)
  v_resultado := regexp_replace(v_resultado, '[_-]{5,}', '', 'g');

  -- Remove placeholders comuns
  v_resultado := regexp_replace(v_resultado, '\[[A-Z_][A-Z0-9_]*\]', '', 'g');  -- [NOME] [CPF]
  v_resultado := regexp_replace(v_resultado, '\{\{[a-z_]+\}\}', '', 'g');       -- {{cliente}}
  v_resultado := regexp_replace(v_resultado, '%s|%d', '', 'g');

  -- Remove cabeçalhos de cláusula repetidos (CLÁUSULA X · § Y)
  v_resultado := regexp_replace(v_resultado, 'CLÁUSULA\s+\d+[º°]?[^\n]*\n', '', 'g');
  v_resultado := regexp_replace(v_resultado, '§\s*\d+[º°]?\s*-', '', 'g');

  -- Normalizar whitespace
  v_resultado := regexp_replace(v_resultado, '\s+', ' ', 'g');
  v_resultado := trim(v_resultado);

  -- Cap em p_cap_bytes (corta em fim de frase mais próximo)
  IF length(v_resultado) > p_cap_bytes THEN
    -- Tenta cortar em '. ' ou '! ' ou '? ' antes do cap
    v_resultado := substring(v_resultado from 1 for p_cap_bytes);
    -- Procura último ponto final · trim
    v_resultado := regexp_replace(v_resultado, '[^.!?]*$', '');
    -- Se ficou vazio · usar cap simples
    IF length(v_resultado) < p_cap_bytes / 2 THEN
      v_resultado := substring(p_text from 1 for p_cap_bytes);
    END IF;
  END IF;

  v_bytes_finais := length(v_resultado);

  RETURN jsonb_build_object(
    'texto_limpo', v_resultado,
    'bytes_originais', v_bytes_originais,
    'bytes_finais', v_bytes_finais,
    'bytes_removidos', v_bytes_originais - v_bytes_finais
  );
END;
$function$


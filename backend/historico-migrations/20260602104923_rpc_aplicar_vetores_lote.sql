-- RPC de gravação de vetores em massa (1 UPDATE/lote = 1 conexão), usada pela edge gerar-embedding.
-- Substitui o padrão antigo (1 update por linha via PostgREST) que estourava o pool de conexões.
CREATE OR REPLACE FUNCTION public.aplicar_vetores_lote(
  p_tabela text,
  p_ids uuid[],
  p_vetores text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer := 0;
  tem_status boolean;
BEGIN
  -- whitelist anti-injeção (mesma da edge)
  IF p_tabela NOT IN (
    'blocos_comportamento','blocos_gatilho','blocos_humanizacao','memoria_lead','lead_memory_fatos',
    'perguntas_sem_resposta','blocos_conhecimento','blocos_variacao','blocos_meta','memoria_episodica',
    'blocos_procedurais','emocao_blocos','prova_social_blocos','anti_padroes','diretriz_bolha_blocos',
    'manipulacao_blocos','agente_identidade','regras_operacionais_blocos','pivots_categoria_intent',
    'acao_pausa_blocos','automacao_blocos','admin_ia_blocos','admin_ia_memoria','fase_requisitos',
    'candidatos_tag','ferramentas_dinamicas'
  ) THEN
    RAISE EXCEPTION 'tabela nao permitida: %', p_tabela;
  END IF;

  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL
     OR array_length(p_ids,1) <> array_length(p_vetores,1) THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=p_tabela AND column_name='embedding_status'
  ) INTO tem_status;

  IF tem_status THEN
    EXECUTE format(
      'UPDATE public.%I AS t SET vetor_semantico = v.vec::extensions.halfvec, embedding_status = ''pronto'' '
      'FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS vec) AS v WHERE t.id = v.id',
      p_tabela
    ) USING p_ids, p_vetores;
  ELSE
    EXECUTE format(
      'UPDATE public.%I AS t SET vetor_semantico = v.vec::extensions.halfvec '
      'FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS vec) AS v WHERE t.id = v.id',
      p_tabela
    ) USING p_ids, p_vetores;
  END IF;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_vetores_lote(text, uuid[], text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_vetores_lote(text, uuid[], text[]) TO service_role;
;

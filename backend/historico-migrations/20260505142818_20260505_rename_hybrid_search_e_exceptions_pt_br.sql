-- Onda 2A: hybrid_search_* + vector_search + enqueue_embedding_job → PT-BR

-- hybrid_search_* (21 funções)
ALTER FUNCTION public.hybrid_search(text, text, uuid, integer, double precision, double precision, integer, text[]) RENAME TO busca_hibrida;
ALTER FUNCTION public.hybrid_search_acao_pausa(text, halfvec, uuid, uuid, integer, double precision, double precision, integer) RENAME TO busca_hibrida_acao_pausa;
ALTER FUNCTION public.hybrid_search_admin_ia(text, halfvec, text, integer, integer) RENAME TO busca_hibrida_admin_ia;
ALTER FUNCTION public.hybrid_search_agente_identidade(text, halfvec, uuid, integer, numeric, integer, double precision, double precision) RENAME TO busca_hibrida_agente_identidade;
ALTER FUNCTION public.hybrid_search_anti_padroes(text, halfvec, uuid, uuid, integer, numeric, integer, double precision, double precision, text) RENAME TO busca_hibrida_anti_padroes;
ALTER FUNCTION public.hybrid_search_behavior(text, halfvec, uuid, uuid, uuid, integer, double precision, double precision, integer, text) RENAME TO busca_hibrida_comportamento;
ALTER FUNCTION public.hybrid_search_diretriz_bolha(text, halfvec, uuid, uuid, integer, numeric, integer, double precision, double precision) RENAME TO busca_hibrida_diretriz_bolha;
ALTER FUNCTION public.hybrid_search_emocao_chunks(text, halfvec, uuid, uuid, integer, numeric, integer, double precision, double precision) RENAME TO busca_hibrida_emocao_blocos;
ALTER FUNCTION public.hybrid_search_episodic(text, halfvec, uuid, uuid, integer) RENAME TO busca_hibrida_episodica;
ALTER FUNCTION public.hybrid_search_episodic_memory(text, halfvec, uuid, uuid, integer, numeric, integer, double precision, double precision) RENAME TO busca_hibrida_memoria_episodica;
ALTER FUNCTION public.hybrid_search_fase_requisitos(text, halfvec, text, uuid, uuid, uuid, uuid, integer, double precision, double precision, integer) RENAME TO busca_hibrida_fase_requisitos;
ALTER FUNCTION public.hybrid_search_human(text, halfvec, uuid, uuid, text[], integer, double precision, double precision, integer) RENAME TO busca_hibrida_humanizacao;
ALTER FUNCTION public.hybrid_search_knowledge(text, halfvec, uuid, uuid, text, text, integer, double precision, double precision, integer, text) RENAME TO busca_hibrida_conhecimento;
ALTER FUNCTION public.hybrid_search_lead_memory(uuid, text, halfvec, integer, double precision, double precision, integer) RENAME TO busca_hibrida_memoria_lead;
ALTER FUNCTION public.hybrid_search_manipulacao(text, halfvec, uuid, uuid, integer, numeric, integer, double precision, double precision) RENAME TO busca_hibrida_manipulacao;
ALTER FUNCTION public.hybrid_search_meta(text, halfvec, uuid, uuid, text, integer, double precision, double precision, integer) RENAME TO busca_hibrida_meta;
ALTER FUNCTION public.hybrid_search_procedural_chunks(text, halfvec, uuid, uuid, integer, numeric, integer, double precision, double precision) RENAME TO busca_hibrida_procedurais;
ALTER FUNCTION public.hybrid_search_prova_social(text, halfvec, uuid, uuid, integer, numeric, integer, double precision, double precision) RENAME TO busca_hibrida_prova_social;
ALTER FUNCTION public.hybrid_search_regras_operacionais(text, halfvec, text, uuid, uuid, integer, numeric, integer, double precision, double precision) RENAME TO busca_hibrida_regras_operacionais;
ALTER FUNCTION public.hybrid_search_trigger(text, halfvec, uuid, uuid, integer, double precision, double precision, integer) RENAME TO busca_hibrida_gatilho;
ALTER FUNCTION public.hybrid_search_variation(text, halfvec, uuid, uuid, uuid, integer, integer, text, text[]) RENAME TO busca_hibrida_variacao;

-- vector_search
ALTER FUNCTION public.vector_search(vector, uuid, integer, double precision, text[]) RENAME TO busca_vetorial;

-- enqueue_embedding_job (trigger function, sem args)
ALTER FUNCTION public.enqueue_embedding_job() RENAME TO enfileirar_tarefa_embedding;

-- Refactor de bodies plpgsql que referenciam essas funções
DO $migr$
DECLARE
  r record; v_def text; v_new_def text;
  v_pares text[][] := ARRAY[
    ['hybrid_search_regras_operacionais', 'busca_hibrida_regras_operacionais'],
    ['hybrid_search_procedural_chunks', 'busca_hibrida_procedurais'],
    ['hybrid_search_agente_identidade', 'busca_hibrida_agente_identidade'],
    ['hybrid_search_fase_requisitos', 'busca_hibrida_fase_requisitos'],
    ['hybrid_search_diretriz_bolha', 'busca_hibrida_diretriz_bolha'],
    ['hybrid_search_episodic_memory', 'busca_hibrida_memoria_episodica'],
    ['hybrid_search_emocao_chunks', 'busca_hibrida_emocao_blocos'],
    ['hybrid_search_anti_padroes', 'busca_hibrida_anti_padroes'],
    ['hybrid_search_prova_social', 'busca_hibrida_prova_social'],
    ['hybrid_search_lead_memory', 'busca_hibrida_memoria_lead'],
    ['hybrid_search_manipulacao', 'busca_hibrida_manipulacao'],
    ['hybrid_search_acao_pausa', 'busca_hibrida_acao_pausa'],
    ['hybrid_search_knowledge', 'busca_hibrida_conhecimento'],
    ['hybrid_search_variation', 'busca_hibrida_variacao'],
    ['hybrid_search_episodic', 'busca_hibrida_episodica'],
    ['hybrid_search_behavior', 'busca_hibrida_comportamento'],
    ['hybrid_search_trigger', 'busca_hibrida_gatilho'],
    ['hybrid_search_admin_ia', 'busca_hibrida_admin_ia'],
    ['hybrid_search_human', 'busca_hibrida_humanizacao'],
    ['hybrid_search_meta', 'busca_hibrida_meta'],
    ['hybrid_search', 'busca_hibrida'],
    ['enqueue_embedding_job', 'enfileirar_tarefa_embedding'],
    ['vector_search', 'busca_vetorial']
  ];
  v_par text[]; v_total int := 0; v_ok int := 0; v_err int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind IN ('f','p') AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  LOOP
    v_def := pg_get_functiondef(r.oid); v_new_def := v_def;
    FOREACH v_par SLICE 1 IN ARRAY v_pares LOOP
      v_new_def := regexp_replace(v_new_def, '\m'||v_par[1]||'\M', v_par[2], 'g');
    END LOOP;
    IF v_new_def IS DISTINCT FROM v_def THEN
      v_total := v_total + 1;
      BEGIN EXECUTE v_new_def; v_ok := v_ok + 1;
      EXCEPTION WHEN OTHERS THEN v_err := v_err + 1; RAISE WARNING 'Erro %.%: %', 'public', r.proname, SQLERRM;
      END;
    END IF;
  END LOOP;
  RAISE NOTICE 'Refactor: total=%, ok=%, err=%', v_total, v_ok, v_err;
END;
$migr$;

NOTIFY pgrst, 'reload schema';
;

-- Onda 3A: 6 tabelas EN restantes (profiles preservada — auth Supabase)
ALTER TABLE public.llm_models RENAME TO modelos_llm;
ALTER TABLE public.llm_providers RENAME TO provedores_llm;
ALTER TABLE public.llm_request_logs RENAME TO logs_requisicao_llm;
ALTER TABLE public.kv_cache RENAME TO cache_kv;
ALTER TABLE public.typing_state RENAME TO estado_digitacao;
ALTER TABLE public.lead_locks RENAME TO travas_lead;

-- Refactor de funções plpgsql que referenciam essas tabelas
DO $migr$
DECLARE
  r record; v_def text; v_new_def text;
  v_pares text[][] := ARRAY[
    ['llm_request_logs', 'logs_requisicao_llm'],
    ['llm_providers', 'provedores_llm'],
    ['typing_state', 'estado_digitacao'],
    ['llm_models', 'modelos_llm'],
    ['lead_locks', 'travas_lead'],
    ['kv_cache', 'cache_kv']
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

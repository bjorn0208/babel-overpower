-- Fase 2 Frente 3 baixo-risco: 6 tabelas legadas em EN -> PT-BR
-- profiles e config_* PRESERVADOS (risco alto, decisão Theus)

ALTER TABLE public.admin_ia_actions RENAME TO admin_ia_acoes;
ALTER TABLE public.trigger_thresholds RENAME TO limiares_gatilho;
ALTER TABLE public.tenant_opt_outs RENAME TO exclusoes_tenant;
ALTER TABLE public.log_reflexao RENAME TO registro_reflexao;
ALTER TABLE public.log_fusao_tag RENAME TO registro_fusao_tag;
ALTER TABLE public.log_uso_api RENAME TO registro_uso_api;

-- Refactor de funções plpgsql que referenciam tabelas renomeadas (mesma técnica Big-Bang)
DO $migr$
DECLARE
  r record;
  v_def text;
  v_new_def text;
  v_pares text[][] := ARRAY[
    ['admin_ia_actions','admin_ia_acoes'],
    ['trigger_thresholds','limiares_gatilho'],
    ['tenant_opt_outs','exclusoes_tenant'],
    ['log_reflexao','registro_reflexao'],
    ['log_fusao_tag','registro_fusao_tag'],
    ['log_uso_api','registro_uso_api']
  ];
  v_par text[];
  v_total int := 0;
  v_ok int := 0;
  v_err int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, n.nspname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prolang = (SELECT oid FROM pg_language WHERE lanname='plpgsql')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new_def := v_def;
    FOREACH v_par SLICE 1 IN ARRAY v_pares LOOP
      v_new_def := regexp_replace(v_new_def, '\m' || v_par[1] || '\M', v_par[2], 'g');
    END LOOP;
    IF v_new_def IS DISTINCT FROM v_def THEN
      v_total := v_total + 1;
      BEGIN
        EXECUTE v_new_def;
        v_ok := v_ok + 1;
      EXCEPTION WHEN OTHERS THEN
        v_err := v_err + 1;
        RAISE WARNING 'Erro ao recriar %.%: %', r.nspname, r.proname, SQLERRM;
      END;
    END IF;
  END LOOP;
  RAISE NOTICE 'Refactor funcoes: total=%, ok=%, err=%', v_total, v_ok, v_err;
END;
$migr$;

NOTIFY pgrst, 'reload schema';
;

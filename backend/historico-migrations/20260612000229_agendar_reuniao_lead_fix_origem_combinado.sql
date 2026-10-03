-- Fix: compromissos.origem só aceita autonomo|combinado|manual — reunião marcada COM o lead = 'combinado'.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname = 'agendar_reuniao_lead';
  IF position('p_inicio, ''agente'', p_tenant_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'trecho esperado não encontrado — abortando';
  END IF;
  v_def := replace(v_def, 'p_inicio, ''agente'', p_tenant_id', 'p_inicio, ''combinado'', p_tenant_id');
  EXECUTE v_def;
END $$;
;

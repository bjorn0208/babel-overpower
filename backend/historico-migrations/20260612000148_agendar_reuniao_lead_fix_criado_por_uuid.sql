-- Fix: compromissos.criado_por é uuid (eu passava 'agente' texto). Usa o tenant como criador.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname = 'agendar_reuniao_lead';
  IF position('''agente'', ''agente''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'trecho esperado não encontrado — abortando pra não corromper';
  END IF;
  v_def := replace(v_def, '''agente'', ''agente'', ''pendente''', '''agente'', p_tenant_id, ''pendente''');
  EXECUTE v_def;
END $$;
;

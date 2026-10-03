SET statement_timeout = '15s';
SET lock_timeout = '5s';

DO $migra$
DECLARE
  v_def text;
  v_novo text;
BEGIN
  v_def := pg_get_functiondef(
    'public.gerar_contrato_do_template(uuid,uuid,jsonb,uuid,uuid,uuid)'::regprocedure
  );

  INSERT INTO public._migration_rpc_backup (nome, corpo)
  VALUES ('gerar_contrato_do_template__pre_3a4', v_def)
  ON CONFLICT (nome) DO NOTHING;

  IF position($q$'entrada', v_entrada$q$ IN v_def) > 0 THEN
    RAISE NOTICE 'Fase 3a.4 já aplicada — nada a fazer';
    RETURN;
  END IF;

  v_novo := replace(
    v_def,
    $q$'max_parcelas', COALESCE(v_parcelas, 12),$q$,
    $q$'max_parcelas', COALESCE(v_parcelas, 12),
    'entrada', v_entrada,
    'valor_parcela', v_valor_parc,
    'parcelas', v_parcelas,$q$
  );

  IF v_novo = v_def THEN
    RAISE EXCEPTION 'Âncora max_parcelas não encontrada — abortado para não recriar a função sem o delta';
  END IF;

  EXECUTE v_novo;
END $migra$;
;

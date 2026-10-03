SET statement_timeout = '15s';
SET lock_timeout = '5s';

DO $m1$
DECLARE v_def text; v_novo text;
BEGIN
  v_def := pg_get_functiondef('public.enviar_comprovante_pagamento_publico(uuid,text)'::regprocedure);
  INSERT INTO public._migration_rpc_backup (nome, corpo)
  VALUES ('enviar_comprovante_pagamento_publico__pre_pt', v_def)
  ON CONFLICT (nome) DO NOTHING;

  IF position('url_comprovante_pagamento' IN v_def) = 0 THEN
    v_novo := replace(v_def, 'payment_proof_url', 'url_comprovante_pagamento');
    IF v_novo = v_def THEN
      RAISE EXCEPTION 'payment_proof_url ausente em enviar_comprovante_pagamento_publico — abortado';
    END IF;
    EXECUTE v_novo;
  END IF;
END $m1$;

DO $m2$
DECLARE v_def text; v_novo text;
BEGIN
  v_def := pg_get_functiondef('public.resumo_cliente(uuid)'::regprocedure);
  INSERT INTO public._migration_rpc_backup (nome, corpo)
  VALUES ('resumo_cliente__pre_pt', v_def)
  ON CONFLICT (nome) DO NOTHING;

  IF position('signed_at' IN v_def) > 0
     OR position(', title,' IN v_def) > 0
     OR position('payment_options' IN v_def) > 0
  THEN
    v_novo := v_def;
    v_novo := replace(v_novo, 'signed_at', 'assinado_em');
    v_novo := replace(v_novo, ', title,', ', titulo,');
    v_novo := replace(v_novo, 'payment_options', 'opcoes_pagamento');
    EXECUTE v_novo;
  END IF;
END $m2$;
;

-- Big-Bang vocab pt-BR: 2 funcoes ainda referenciam <alias>.payload em tabelas
-- onde a coluna virou `carga`:
--   admin_ia_levantar_lead_360 -> admin_ia_propostas.payload (agora carga)
--   existe_compromisso_ativo   -> acoes_agendadas.payload   (agora carga)
-- Sem este fix, levantar lead 360 retorna erro silencioso e existe_compromisso_ativo
-- nunca acha compromisso ativo de cobranca por origem trigger (gerar_contrato em pos-venda).

DO $$
DECLARE
  fn record;
  novo_def text;
BEGIN
  FOR fn IN
    SELECT proname, oid, pg_get_functiondef(oid) AS def
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('admin_ia_levantar_lead_360','existe_compromisso_ativo')
  LOOP
    novo_def := regexp_replace(fn.def, '(\.\s*)payload([^a-zA-Z0-9_])', '\1carga\2', 'g');
    IF novo_def = fn.def THEN
      RAISE NOTICE 'sem mudanca: %', fn.proname;
    ELSE
      EXECUTE novo_def;
      RAISE NOTICE 'atualizada: %', fn.proname;
    END IF;
  END LOOP;
END $$;
;

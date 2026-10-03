-- v7: o construtor v2 grava `conteudo_comum` como doc TipTap (JSON serializado em text).
-- A RPC preferia conteudo_comum ao texto legado → contratos do Diego saíam com JSON cru
-- na página pública (caso M.M/Ivonaldo, 54 contratos). Regra nova: conteudo_comum que
-- parece doc do editor é IGNORADO — usa `conteudo` (texto puro, sempre sincronizado
-- pelo construtor via DEC-037). Backup v6: gerar_contrato_do_template__pre_f3c_v7.
DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='gerar_contrato_do_template';

  v_def := replace(v_def,
    $$v_texto := COALESCE(NULLIF(v_tpl.conteudo_comum, ''), v_tpl.conteudo, '');$$,
    $$v_texto := CASE
    WHEN v_tpl.conteudo_comum IS NOT NULL AND left(ltrim(v_tpl.conteudo_comum), 9) = '{"type":"'
      THEN COALESCE(NULLIF(v_tpl.conteudo, ''), '')
    ELSE COALESCE(NULLIF(v_tpl.conteudo_comum, ''), v_tpl.conteudo, '')
  END;$$);

  IF v_def NOT LIKE '%{"type":"%' THEN
    RAISE EXCEPTION 'replace do v_texto não casou — abortando pra não aplicar função inalterada';
  END IF;

  EXECUTE v_def;
END
$do$;
;

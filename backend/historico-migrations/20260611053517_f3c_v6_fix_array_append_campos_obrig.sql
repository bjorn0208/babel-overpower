-- Fix do smoke F3c: `text[] || 'literal'` é ambíguo pro parser (tenta array||array).
-- Troca por array_append explícito no acréscimo das exigências.
DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='gerar_contrato_do_template';

  v_def := replace(v_def, $$v_campos_obrig := v_campos_obrig || 'documento';$$,
                          $$v_campos_obrig := array_append(v_campos_obrig, 'documento');$$);
  v_def := replace(v_def, $$v_campos_obrig := v_campos_obrig || 'assinatura_manuscrita';$$,
                          $$v_campos_obrig := array_append(v_campos_obrig, 'assinatura_manuscrita');$$);
  v_def := replace(v_def, $$v_campos_obrig := v_campos_obrig || 'selfie';$$,
                          $$v_campos_obrig := array_append(v_campos_obrig, 'selfie');$$);

  EXECUTE v_def;
END
$do$;
;

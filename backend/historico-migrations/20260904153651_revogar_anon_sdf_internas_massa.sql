-- P1 Raio-X 2026-09-04 — varredura ampla. Revoga EXECUTE de PUBLIC/anon/authenticated
-- de funcoes SECURITY DEFINER internas (nao token-based, nao checam auth, sem chamador
-- no frontend). Mantem service_role. Exclui as 5 P0 (ja feitas) e as 9 chamadas pelo
-- frontend (revisao manual). Testado no local: 162 revogadas, publicas preservadas.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT (pg_get_function_identity_arguments(p.oid) ~* 'token'
               OR p.proname ~* '_publico|publico_')
      AND NOT (pg_get_functiondef(p.oid) ~* 'auth\.uid|auth\.role|_eh_platform_admin|eh_super_admin|jwt')
      AND p.proname NOT IN (
        'admin_query_sql','admin_agregar','atualizar_dados_escrita',
        'preparar_exclusao_dados','_cronjob_montar_command',
        'buscar_ou_criar_conversa','entrar_sala_publica','fn_alertas_dossie',
        'fn_dossie_lead_consolidado','get_lead_tracking_status','info_sala_publica',
        'recusar_saque','resolver_codigo_indicacao','sair_sala_publica'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'funcoes revogadas: %', n;
END $$;
;

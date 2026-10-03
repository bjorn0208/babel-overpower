-- P1 Raio-X 2026-09-04: 4 funcoes SDF chamadas por paginas de app LOGADO
-- (apps/user, apps/admin) estavam anon-executaveis. Revoga anon/PUBLIC, mantem
-- authenticated (o app logado segue) + service_role. recusar_saque e acao
-- financeira de admin — critico tirar do anon.
-- Residual conhecido: nao checam auth.uid no corpo, entao um usuario logado de
-- outro tenant ainda pode chama-las passando ids alheios — correcao definitiva e
-- adicionar checagem de tenant/admin no corpo (mudanca de codigo, fora deste grant).
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='public'
      AND p.proname IN ('buscar_ou_criar_conversa','fn_alertas_dossie',
                        'fn_dossie_lead_consolidado','recusar_saque')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'ajustadas: %', n;
END $$;
;

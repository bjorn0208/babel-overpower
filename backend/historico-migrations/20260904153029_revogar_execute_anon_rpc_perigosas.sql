-- Fecha 3 P0 do Raio-X 2026-09-04: revoga EXECUTE de PUBLIC/anon/authenticated
-- em 5 funcoes SECURITY DEFINER chamaveis sem login (leitura/escrita cross-tenant).
-- Mantem service_role (edge functions seguem). Testado no local; call-site analysis
-- confirmou que nenhum chamador legitimo usa anon/authenticated.

REVOKE EXECUTE ON FUNCTION public.admin_query_sql(p_query text, p_limite integer)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_query_sql(p_query text, p_limite integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_agregar(p_tabela text, p_group_by text[], p_metricas jsonb, p_filtros jsonb, p_limite integer)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_agregar(p_tabela text, p_group_by text[], p_metricas jsonb, p_filtros jsonb, p_limite integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.atualizar_dados_escrita(p_owner uuid, p_sql text, p_confirmar_em_massa boolean)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.atualizar_dados_escrita(p_owner uuid, p_sql text, p_confirmar_em_massa boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.preparar_exclusao_dados(p_owner uuid, p_conversa uuid, p_sql text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.preparar_exclusao_dados(p_owner uuid, p_conversa uuid, p_sql text) TO service_role;

REVOKE EXECUTE ON FUNCTION public._cronjob_montar_command(p_edge_function text, p_parametros jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._cronjob_montar_command(p_edge_function text, p_parametros jsonb) TO service_role;
;

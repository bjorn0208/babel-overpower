-- P0. `salvar_resultados_turno` é a RPC interna que o motor usa pra persistir o turno.
-- Estava SECURITY DEFINER e executável por anon/authenticated SEM nenhuma autorização:
-- sem checagem de admin, sem auth.uid(), sem RAISE. Com a chave anon (que é pública no
-- frontend) dava pra:
--   - inserir mensagem em QUALQUER conversa, tanto com role 'user' quanto 'assistant'
--     (diálogo fabricado aparecendo pro operador e no histórico do lead);
--   - sobrescrever a ficha de QUALQUER lead (fase, resumo, dados_capturados, histórico);
--   - gravar consumo/custo em registro_uso_api com tenant_id arbitrário.
--
-- Passou batido no raio-x de 2026-09-04 de manhã porque o nome não parece administrativo.
-- Escapou também do filtro por nome: as outras 7 SECURITY DEFINER sem guarda expostas ao
-- anon são `publico_*`/`*_publico`, superfície pública por desenho — esta não é.
--
-- service_role mantém o EXECUTE (é quem o motor usa). Nenhum call site no frontend:
-- só aparece em types.ts gerado.

revoke execute on function public.salvar_resultados_turno(
  uuid, uuid, text, text[], integer, text, jsonb, text, text[], uuid, text,
  integer, integer, numeric, integer, text, text, jsonb, jsonb, uuid, boolean
) from anon;

revoke execute on function public.salvar_resultados_turno(
  uuid, uuid, text, text[], integer, text, jsonb, text, text[], uuid, text,
  integer, integer, numeric, integer, text, text, jsonb, jsonb, uuid, boolean
) from authenticated;
;

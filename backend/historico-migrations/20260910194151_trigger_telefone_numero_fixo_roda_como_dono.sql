-- Fixar número COM WhatsApp no wizard de rifas voltava 403 (a tela mostrava
-- "Falha ao fixar: [object Object]"). A trigger de normalização de telefone
-- roda como quem insere (authenticated, via PostgREST) e chama
-- public.normalizar_telefone_brasil — que é SECURITY DEFINER e teve EXECUTE
-- revogado de anon/authenticated no endurecimento de funções SDF. Resultado:
-- 42501 "permission denied for function normalizar_telefone_brasil".
-- Sem telefone a trigger não chama a função, por isso só falhava com WhatsApp.
--
-- A trigger passa a rodar como dono. normalizar_telefone_brasil continua fora
-- do alcance de RPC pra anon/authenticated. search_path já é '' na função.
-- Trigger function não é chamável direto (retorna trigger), mas tira o EXECUTE
-- de public/anon/authenticated pra não aparecer como SDF exposta no advisor.

alter function public.trg_normalizar_telefone_numero_fixo() security definer;

revoke execute on function public.trg_normalizar_telefone_numero_fixo() from public, anon, authenticated;
;

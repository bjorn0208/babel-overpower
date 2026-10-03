-- anon herdava EXECUTE via PUBLIC (default do Postgres) — defesa em profundidade.
REVOKE ALL ON FUNCTION public.editar_resposta_pergunta_mentor(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.excluir_pergunta_mentor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_resposta_pergunta_mentor(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_pergunta_mentor(uuid) TO authenticated, service_role;
;

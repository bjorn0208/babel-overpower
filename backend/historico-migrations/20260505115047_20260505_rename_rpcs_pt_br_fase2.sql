-- Fase 2 Frente 2: rename de 9 RPCs em inglês para PT-BR
-- ALTER FUNCTION ... RENAME TO preserva body, GRANTs, SECURITY DEFINER, search_path
ALTER FUNCTION public.get_or_create_conversation(text, uuid, uuid, text, text) RENAME TO buscar_ou_criar_conversa;
ALTER FUNCTION public.soft_delete_campaign(uuid) RENAME TO excluir_campanha;
ALTER FUNCTION public.create_manual_client(text, text, text, text) RENAME TO criar_cliente_manual;
ALTER FUNCTION public.admin_delete_users(uuid[]) RENAME TO admin_excluir_usuarios;
ALTER FUNCTION public.delete_custom_field(uuid, text) RENAME TO excluir_campo_personalizado;
ALTER FUNCTION public.generate_tag_merge_suggestions(uuid, numeric, integer) RENAME TO gerar_sugestoes_fusao_tag;
ALTER FUNCTION public.search_admin_ia_chunks_taxonomico(text, halfvec, text, text, integer, integer) RENAME TO buscar_admin_ia_blocos_taxonomico;
ALTER FUNCTION public.search_admin_ia_kb_academica(text, halfvec, integer, integer) RENAME TO buscar_admin_ia_base_academica;
ALTER FUNCTION public.search_admin_ia_memoria(text, halfvec, text, text, integer) RENAME TO buscar_admin_ia_memoria;
NOTIFY pgrst, 'reload schema';
;

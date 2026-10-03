-- Limpeza Geral v1.0 - Onda B (compatibilidade de nomenclatura)
-- Cria alias canonico admin_ia_descrever_tabela apontando para a funcao admin_ia_descrever_tabela_v2
-- A versao com sufixo _v2 permanece viva durante a janela de migracao do unico caller conhecido (cron-admin-ia-schemas)

CREATE OR REPLACE FUNCTION public.admin_ia_descrever_tabela(p_tabela text)
RETURNS TABLE (
  nome text,
  tipo text,
  nullable boolean,
  default_val text,
  enum_valores text[],
  comentario text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.admin_ia_descrever_tabela_v2(p_tabela);
END;
$$;

COMMENT ON FUNCTION public.admin_ia_descrever_tabela(text) IS 'Nome canonico (sem sufixo de versao) - delega para admin_ia_descrever_tabela_v2 durante janela de compatibilidade. Limpeza Geral v1.0 Onda B.';

GRANT EXECUTE ON FUNCTION public.admin_ia_descrever_tabela(text) TO service_role;

;

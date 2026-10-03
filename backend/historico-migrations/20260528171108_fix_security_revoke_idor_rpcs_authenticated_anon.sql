-- Fix segurança IDOR — REVOKE EXECUTE de authenticated/anon nas 6 RPCs
-- SECURITY DEFINER que aceitavam tenant_id arbitrário. Nenhuma é chamada do
-- frontend hoje; todas são chamadas só pelas edges via service_role.

REVOKE EXECUTE ON FUNCTION public.detectar_leads_duplicados(p_tenant_id uuid)
  FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mesclar_lead(p_lead_duplicado_id uuid, p_lead_canonico_id uuid)
  FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.obter_config_chamada_llm(p_chave text, p_tenant_id uuid, p_nicho_id uuid)
  FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.abrir_objetivo_pilha(p_conversa_id uuid, p_tenant_id uuid, p_objetivo text, p_contexto text, p_lead_id uuid, p_prioridade integer, p_origem text)
  FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fechar_objetivo_pilha(p_objetivo_id uuid, p_motivo text)
  FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analisar_causa_efeito_tenant(p_tenant_id uuid)
  FROM authenticated, anon, PUBLIC;

-- Garantir service_role mantém (idempotente).
GRANT EXECUTE ON FUNCTION public.detectar_leads_duplicados(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mesclar_lead(p_lead_duplicado_id uuid, p_lead_canonico_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.obter_config_chamada_llm(p_chave text, p_tenant_id uuid, p_nicho_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.abrir_objetivo_pilha(p_conversa_id uuid, p_tenant_id uuid, p_objetivo text, p_contexto text, p_lead_id uuid, p_prioridade integer, p_origem text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fechar_objetivo_pilha(p_objetivo_id uuid, p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.analisar_causa_efeito_tenant(p_tenant_id uuid) TO service_role;
;

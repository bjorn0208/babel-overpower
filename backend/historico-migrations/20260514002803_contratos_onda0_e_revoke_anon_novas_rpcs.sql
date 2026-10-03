-- RPCs novas são pra tenant autenticado (auth.uid() obrigatório). Revoke de anon.
-- As demais RPCs de contrato (assinar_contrato_publico, obter_contrato_por_token, etc) são públicas por design.

REVOKE EXECUTE ON FUNCTION public.criar_contrato_livre(text, text, uuid, uuid, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.criar_template_a_partir_de_texto(text, text, jsonb, uuid, integer, text, boolean) FROM anon;

;

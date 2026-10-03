-- Wrapper emergencial #2 (2026-05-06).
-- Big-Bang renomeou derive_tags_for_lead -> derivar_tags_para_lead, mas
-- trigger function trg_derive_tags_dados_ficha ainda chama o nome velho.
-- Erro espalha pelo chat (500), por trigger AFTER UPDATE em fichas_lead.
-- Tracker: documentos/operacao/2026-05/2026-05-06/1403-...md

CREATE OR REPLACE FUNCTION public.derive_tags_for_lead(p_lead_id uuid)
  RETURNS integer
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT public.derivar_tags_para_lead(p_lead_id);
$$;

GRANT EXECUTE ON FUNCTION public.derive_tags_for_lead(uuid)
  TO anon, authenticated, service_role, postgres;

COMMENT ON FUNCTION public.derive_tags_for_lead(uuid) IS
  'WRAPPER EMERGENCIAL 2026-05-06 - aponta pra derivar_tags_para_lead. Trigger trg_derive_tags_dados_ficha ainda chama o nome velho. DROPAR apos atualizar o trigger function.';

NOTIFY pgrst, 'reload schema';
;

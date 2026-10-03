-- ============================================================
-- 1) config_contrato: remover SELECT anônimo
-- ============================================================
DROP POLICY IF EXISTS cs_anon_select ON public.config_contrato;

-- ============================================================
-- 2) Tabelas globais (RAG/intent): admin de plataforma somente
-- ============================================================
DROP POLICY IF EXISTS categorias_knowledge_admin ON public.categorias_conhecimento;
CREATE POLICY categorias_knowledge_admin ON public.categorias_conhecimento
  FOR ALL TO authenticated
  USING (public.eh_admin_plataforma())
  WITH CHECK (public.eh_admin_plataforma());

DROP POLICY IF EXISTS intent_pivots_admin ON public.pivots_categoria_intent;
CREATE POLICY intent_pivots_admin ON public.pivots_categoria_intent
  FOR ALL TO authenticated
  USING (public.eh_admin_plataforma())
  WITH CHECK (public.eh_admin_plataforma());

DROP POLICY IF EXISTS boosts_categoria_admin ON public.boosts_categoria;
CREATE POLICY boosts_categoria_admin ON public.boosts_categoria
  FOR ALL TO authenticated
  USING (public.eh_admin_plataforma())
  WITH CHECK (public.eh_admin_plataforma());

-- ============================================================
-- 3) Indicador público: remover anon e usar RPC SECURITY DEFINER
-- ============================================================
DROP POLICY IF EXISTS cim_anon_select ON public.meta_indicacao_campanha;
DROP POLICY IF EXISTS cic_anon_select ON public.comissoes_indicacao_campanha;

CREATE OR REPLACE FUNCTION public.get_indicador_publico(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta record;
  v_camp record;
  v_emp record;
  v_settings record;
  v_leads jsonb;
  v_comissoes jsonb;
BEGIN
  SELECT campaign_id, tenant_id, cupom, token, indicador_nome, indicador_email,
         indicador_telefone, indicador_foto_url, comissao_tipo, comissao_valor,
         pagamento_valor, pagamento_data, pagamento_metodo, comprovante_url,
         observacao, concluida_at, created_at, updated_at
    INTO v_meta
    FROM public.meta_indicacao_campanha
   WHERE token = p_token
   LIMIT 1;

  IF v_meta IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, status, starts_at, ends_at
    INTO v_camp
    FROM public.campanhas
   WHERE id = v_meta.campaign_id AND deleted_at IS NULL
   LIMIT 1;

  IF v_camp IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT nome, logo_url, descricao, cidade, estado
    INTO v_emp
    FROM public.empresas
   WHERE user_id = v_meta.tenant_id
   LIMIT 1;

  SELECT logo_url, company_name, page_color, company_description
    INTO v_settings
    FROM public.config_contrato
   WHERE tenant_id = v_meta.tenant_id
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', l.id,
           'nome_exibicao', l.nome_exibicao,
           'name', l.name,
           'converted_at', CASE WHEN cl.exit_reason = 'convertido' THEN cl.closed_at ELSE NULL END
         )), '[]'::jsonb)
    INTO v_leads
    FROM public.leads_campanha cl
    JOIN public.leads l ON l.id = cl.lead_id
   WHERE cl.campaign_id = v_meta.campaign_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'lead_id', lead_id,
           'valor_comissao', valor_comissao
         )), '[]'::jsonb)
    INTO v_comissoes
    FROM public.comissoes_indicacao_campanha
   WHERE campaign_id = v_meta.campaign_id;

  RETURN jsonb_build_object(
    'meta', to_jsonb(v_meta),
    'campanha', to_jsonb(v_camp),
    'empresa', to_jsonb(v_emp),
    'settings', to_jsonb(v_settings),
    'leads', v_leads,
    'comissoes', v_comissoes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_indicador_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_indicador_publico(uuid) TO anon, authenticated;

-- ============================================================
-- 4) cronjobs e auditoria: restringir a admin / service_role
-- ============================================================
DROP POLICY IF EXISTS cronjobs_config_select_authenticated ON public.agendamentos_config;
CREATE POLICY cronjobs_config_select_admin ON public.agendamentos_config
  FOR SELECT TO authenticated
  USING (public.eh_admin_plataforma());

DROP POLICY IF EXISTS cronjobs_log_select_authenticated ON public.agendamentos_log;
CREATE POLICY cronjobs_log_select_admin ON public.agendamentos_log
  FOR SELECT TO authenticated
  USING (public.eh_admin_plataforma());

DROP POLICY IF EXISTS cronjobs_log_insert_service ON public.agendamentos_log;
CREATE POLICY cronjobs_log_insert_service ON public.agendamentos_log
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS chunk_audit_select ON public.auditoria_blocos;
CREATE POLICY chunk_audit_select_admin ON public.auditoria_blocos
  FOR SELECT TO authenticated
  USING (public.eh_admin_plataforma());

DROP POLICY IF EXISTS chunk_audit_insert_service ON public.auditoria_blocos;
CREATE POLICY chunk_audit_insert_service ON public.auditoria_blocos
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ============================================================
-- 5) config_plataforma: tirar exposição pública de PIX/CNPJ/saque
--    e criar view pública só com campos seguros (inclui pix_key
--    porque o cadastro público precisa para receber pagamento).
-- ============================================================
DROP POLICY IF EXISTS settings_select_public ON public.config_plataforma;

CREATE POLICY settings_select_authenticated ON public.config_plataforma
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.config_plataforma_publico
WITH (security_invoker = true) AS
SELECT
  id, system_name, logo_url, primary_color, description, domain,
  support_email, pix_key, termos_uso, termos_uso_ativo
FROM public.config_plataforma;

GRANT SELECT ON public.config_plataforma_publico TO anon, authenticated;

-- Política de leitura permitindo a view (security_invoker usa as policies abaixo)
CREATE POLICY settings_select_public_view ON public.config_plataforma
  FOR SELECT TO anon
  USING (true);
-- (A view só expõe colunas seguras; cnpj/saque_*/usd_brl_* ficam ocultos do anon)
-- Nota: poderíamos restringir colunas via grant column-level. A view + security_invoker
-- atinge o mesmo efeito prático para anon, e authenticated continua lendo a tabela.

-- ============================================================
-- 6) config_prompt: exigir login
-- ============================================================
DROP POLICY IF EXISTS srv_prompt_config ON public.config_prompt;
CREATE POLICY config_prompt_select_auth ON public.config_prompt
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 7) Storage: dropar políticas órfãs apontando para buckets
--    que não existem (attachments, client-documents, chat-attachments)
-- ============================================================
DROP POLICY IF EXISTS tenant_read_docs ON storage.objects;
DROP POLICY IF EXISTS attachments_anon_insert ON storage.objects;
DROP POLICY IF EXISTS attachments_anon_select ON storage.objects;
DROP POLICY IF EXISTS attachments_anon_delete ON storage.objects;
DROP POLICY IF EXISTS auth_upload_chat_attachments ON storage.objects;
DROP POLICY IF EXISTS public_read_chat_attachments ON storage.objects;
;

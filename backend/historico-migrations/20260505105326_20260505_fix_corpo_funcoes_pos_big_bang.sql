-- Frente 1 do plano de fix pos big-bang rename:
-- recria todas as funcoes/RPCs cujo corpo (pg_get_functiondef) ainda
-- referencia nomes de tabelas antigos (pre big-bang 2026-05-05).
-- Estrategia: DO block itera pg_proc, faz regexp_replace word-boundary
-- com a lista de 102 renames (ordenados por comprimento desc),
-- e executa CREATE OR REPLACE FUNCTION dinamicamente.

CREATE TABLE IF NOT EXISTS public._migracao_funcoes_log (
  id bigserial primary key,
  oid oid,
  nome text,
  args text,
  status text,
  erro text,
  applied_at timestamptz default now()
);

TRUNCATE public._migracao_funcoes_log;

DO $migracao$
DECLARE
    rec record;
    new_def text;
    rename_row record;
    cont_ok int := 0;
    cont_erro int := 0;
BEGIN
    FOR rec IN
        SELECT p.oid,
               n.nspname || '.' || p.proname AS nome,
               pg_get_function_identity_arguments(p.oid) AS args,
               pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND p.prosrc ~* '\m(conversations|messages|lead_cards|lead_memory|lead_engagement|lead_pattern|lead_cofre_pii|conversation_belief|conversation_audit|conversation_tickets|conversation_pause|conversation_locks|conversation_analysis_snapshots|episodic_memory|message_outbox|message_buffer|message_prompts|pending_delivery|pending_team_invitations|campaigns|campaign_phases|campaign_leads|campaign_automations|campaign_indicacao_meta|campaign_indicacao_comissoes|campaign_lead_repropostas|campaign_trigger_phase_map|scheduled_actions|knowledge_chunks|behavior_chunks|trigger_chunks|human_chunks|variation_chunks|meta_chunks|procedural_chunks|chunk_audit_log|chunk_candidates|categorias_knowledge|intent_categoria_pivots|golden_chunks|golden_runs|golden_run_batches|golden_calibration|canary_rollouts|canary_assignments|admin_ia_chunks|admin_ia_conversations|admin_ia_cronjobs|admin_ia_kb_academica|admin_ia_reflection|admin_ia_tools_disabled|admin_ia_tools_dinamicas|public_profile|public_services|public_gallery|public_testimonials|public_chat_sessions|public_profile_events|store_planos|store_pacotes_extra|store_implantacao|store_plus|client_payments|client_documents|contracts|contract_settings|contract_access_log|tag_observations|tag_candidates|tag_merge_log|tag_merge_suggestions|tag_curadoria_config|tag_vocabulario_alias|ficha_form_campos|ficha_form_valores|notification_sounds|user_notif_prefs|webhook_dedup|webhook_debug|rate_limits|security_incidents|tutorials|tool_invocations|reflection_log|cronjobs_config|cronjobs_log|orphan_questions|prompt_config|platform_settings|support_config|support_messages|purchase_orders|user_subscriptions|user_agents|api_usage_logs|channels|behavior_chunks_tenant_overrides|trigger_chunks_tenant_overrides|human_chunks_tenant_overrides|variation_chunks_tenant_overrides|knowledge_chunks_tenant_overrides|meta_chunks_tenant_overrides)\M'
    LOOP
        new_def := rec.def;
        FOR rename_row IN
            SELECT * FROM (VALUES
                ('knowledge_chunks_tenant_overrides','overrides_tenant_blocos_conhecimento'),
                ('variation_chunks_tenant_overrides','overrides_tenant_blocos_variacao'),
                ('behavior_chunks_tenant_overrides','overrides_tenant_blocos_comportamento'),
                ('conversation_analysis_snapshots','snapshots_analise_conversa'),
                ('trigger_chunks_tenant_overrides','overrides_tenant_blocos_gatilho'),
                ('human_chunks_tenant_overrides','overrides_tenant_blocos_humanizacao'),
                ('meta_chunks_tenant_overrides','overrides_tenant_blocos_meta'),
                ('campaign_indicacao_comissoes','comissoes_indicacao_campanha'),
                ('campaign_trigger_phase_map','mapa_fase_gatilho_campanha'),
                ('campaign_lead_repropostas','repropostas_lead_campanha'),
                ('admin_ia_tools_dinamicas','admin_ia_ferramentas_dinamicas'),
                ('pending_team_invitations','convites_equipe_pendentes'),
                ('admin_ia_tools_disabled','admin_ia_ferramentas_desligadas'),
                ('intent_categoria_pivots','pivots_categoria_intent'),
                ('campaign_indicacao_meta','meta_indicacao_campanha'),
                ('admin_ia_conversations','admin_ia_conversas'),
                ('user_notif_prefs','preferencias_notificacao_usuario'),
                ('public_profile_events','eventos_perfil_publico'),
                ('admin_ia_kb_academica','admin_ia_base_academica'),
                ('tag_merge_suggestions','sugestoes_fusao_tag'),
                ('tag_vocabulario_alias','alias_vocabulario_tag'),
                ('public_chat_sessions','sessoes_chat_publico'),
                ('conversation_tickets','tickets_conversa'),
                ('campaign_automations','automacoes_campanha'),
                ('categorias_knowledge','categorias_conhecimento'),
                ('tag_curadoria_config','config_curadoria_tag'),
                ('public_testimonials','depoimentos_publicos'),
                ('contract_access_log','log_acesso_contrato'),
                ('store_pacotes_extra','loja_pacotes_extra'),
                ('notification_sounds','sons_notificacao'),
                ('admin_ia_reflection','admin_ia_reflexao'),
                ('conversation_belief','crenca_conversa'),
                ('security_incidents','incidentes_seguranca'),
                ('user_subscriptions','assinaturas_usuario'),
                ('canary_assignments','atribuicoes_canario'),
                ('golden_run_batches','lotes_execucao_padrao'),
                ('conversation_locks','travas_conversa'),
                ('conversation_pause','pausa_conversa'),
                ('conversation_audit','auditoria_conversa'),
                ('golden_calibration','calibracao_padrao'),
                ('ficha_form_valores','valores_ficha'),
                ('admin_ia_cronjobs','admin_ia_agendamentos'),
                ('procedural_chunks','blocos_procedurais'),
                ('platform_settings','config_plataforma'),
                ('scheduled_actions','acoes_agendadas'),
                ('store_implantacao','loja_implantacao'),
                ('contract_settings','config_contrato'),
                ('ficha_form_campos','campos_ficha'),
                ('chunk_candidates','candidatos_bloco'),
                ('client_documents','documentos_cliente'),
                ('knowledge_chunks','blocos_conhecimento'),
                ('orphan_questions','perguntas_orfas'),
                ('pending_delivery','entregas_pendentes'),
                ('support_messages','mensagens_suporte'),
                ('tag_observations','observacoes_tag'),
                ('tool_invocations','invocacoes_ferramenta'),
                ('variation_chunks','blocos_variacao'),
                ('admin_ia_chunks','admin_ia_blocos'),
                ('behavior_chunks','blocos_comportamento'),
                ('campaign_phases','fases_campanha'),
                ('canary_rollouts','rollouts_canario'),
                ('chunk_audit_log','auditoria_blocos'),
                ('client_payments','pagamentos_cliente'),
                ('cronjobs_config','agendamentos_config'),
                ('episodic_memory','memoria_episodica'),
                ('lead_engagement','engajamento_lead'),
                ('message_prompts','prompts_mensagem'),
                ('public_services','servicos_publicos'),
                ('purchase_orders','pedidos_compra'),
                ('api_usage_logs','log_uso_api'),
                ('campaign_leads','leads_campanha'),
                ('lead_cofre_pii','cofre_pii_lead'),
                ('message_buffer','buffer_mensagens'),
                ('message_outbox','caixa_saida_mensagens'),
                ('public_gallery','galeria_publica'),
                ('public_profile','perfil_publico'),
                ('reflection_log','log_reflexao'),
                ('support_config','config_suporte'),
                ('tag_candidates','candidatos_tag'),
                ('trigger_chunks','blocos_gatilho'),
                ('conversations','conversas'),
                ('golden_chunks','blocos_padrao'),
                ('prompt_config','config_prompt'),
                ('tag_merge_log','log_fusao_tag'),
                ('webhook_debug','debug_webhook'),
                ('webhook_dedup','dedup_webhook'),
                ('cronjobs_log','agendamentos_log'),
                ('human_chunks','blocos_humanizacao'),
                ('lead_pattern','padrao_lead'),
                ('store_planos','loja_planos'),
                ('golden_runs','execucoes_padrao'),
                ('lead_memory','memoria_lead'),
                ('meta_chunks','blocos_meta'),
                ('rate_limits','limites_taxa'),
                ('user_agents','agentes_usuario'),
                ('lead_cards','fichas_lead'),
                ('store_plus','loja_plus'),
                ('campaigns','campanhas'),
                ('contracts','contratos'),
                ('tutorials','tutoriais'),
                ('channels','canais'),
                ('messages','mensagens')
            ) AS r(antigo, novo)
        LOOP
            new_def := regexp_replace(new_def, '\m' || rename_row.antigo || '\M', rename_row.novo, 'g');
        END LOOP;

        BEGIN
            EXECUTE new_def;
            INSERT INTO public._migracao_funcoes_log(oid, nome, args, status)
            VALUES (rec.oid, rec.nome, rec.args, 'OK');
            cont_ok := cont_ok + 1;
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO public._migracao_funcoes_log(oid, nome, args, status, erro)
            VALUES (rec.oid, rec.nome, rec.args, 'ERRO', SQLERRM);
            cont_erro := cont_erro + 1;
        END;
    END LOOP;

    RAISE NOTICE 'Migracao funcoes pos big-bang: % OK / % ERRO', cont_ok, cont_erro;
END;
$migracao$;
;

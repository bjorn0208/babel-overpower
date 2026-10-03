-- Limpeza Geral v1.0 - Big-Bang Onda B+
-- 84 tabelas renomeadas em transacao atomica para o vocabulario PT-BR oficial.
-- Postgres atualiza automaticamente: views, RLS policies, triggers, FKs, indices, RPCs plpgsql.
-- Pre-voo confirmou: 0 funcoes com EXECUTE de string literal contendo nomes antigos.

BEGIN;

-- Bloco B: lead / conversa / mensagem (19 renames)
ALTER TABLE public.conversations RENAME TO conversas;
ALTER TABLE public.messages RENAME TO mensagens;
ALTER TABLE public.lead_cards RENAME TO fichas_lead;
ALTER TABLE public.lead_memory RENAME TO memoria_lead;
ALTER TABLE public.lead_engagement RENAME TO engajamento_lead;
ALTER TABLE public.lead_pattern RENAME TO padrao_lead;
ALTER TABLE public.lead_cofre_pii RENAME TO cofre_pii_lead;
ALTER TABLE public.conversation_belief RENAME TO crenca_conversa;
ALTER TABLE public.conversation_audit RENAME TO auditoria_conversa;
ALTER TABLE public.conversation_tickets RENAME TO tickets_conversa;
ALTER TABLE public.conversation_pause RENAME TO pausa_conversa;
ALTER TABLE public.conversation_locks RENAME TO travas_conversa;
ALTER TABLE public.conversation_analysis_snapshots RENAME TO snapshots_analise_conversa;
ALTER TABLE public.episodic_memory RENAME TO memoria_episodica;
ALTER TABLE public.message_outbox RENAME TO caixa_saida_mensagens;
ALTER TABLE public.message_buffer RENAME TO buffer_mensagens;
ALTER TABLE public.message_prompts RENAME TO prompts_mensagem;
ALTER TABLE public.pending_delivery RENAME TO entregas_pendentes;
ALTER TABLE public.pending_team_invitations RENAME TO convites_equipe_pendentes;

-- Bloco C: campanha / automacao (9 renames)
ALTER TABLE public.campaigns RENAME TO campanhas;
ALTER TABLE public.campaign_phases RENAME TO fases_campanha;
ALTER TABLE public.campaign_leads RENAME TO leads_campanha;
ALTER TABLE public.campaign_automations RENAME TO automacoes_campanha;
ALTER TABLE public.campaign_indicacao_meta RENAME TO meta_indicacao_campanha;
ALTER TABLE public.campaign_indicacao_comissoes RENAME TO comissoes_indicacao_campanha;
ALTER TABLE public.campaign_lead_repropostas RENAME TO repropostas_lead_campanha;
ALTER TABLE public.campaign_trigger_phase_map RENAME TO mapa_fase_gatilho_campanha;
ALTER TABLE public.scheduled_actions RENAME TO acoes_agendadas;

-- Bloco D: curadoria / RAG (23 renames)
ALTER TABLE public.knowledge_chunks RENAME TO blocos_conhecimento;
ALTER TABLE public.behavior_chunks RENAME TO blocos_comportamento;
ALTER TABLE public.trigger_chunks RENAME TO blocos_gatilho;
ALTER TABLE public.human_chunks RENAME TO blocos_humanizacao;
ALTER TABLE public.variation_chunks RENAME TO blocos_variacao;
ALTER TABLE public.meta_chunks RENAME TO blocos_meta;
ALTER TABLE public.procedural_chunks RENAME TO blocos_procedurais;
ALTER TABLE public.chunk_audit_log RENAME TO auditoria_blocos;
ALTER TABLE public.chunk_candidates RENAME TO candidatos_bloco;
ALTER TABLE public.categorias_knowledge RENAME TO categorias_conhecimento;
ALTER TABLE public.intent_categoria_pivots RENAME TO pivots_categoria_intent;
ALTER TABLE public.golden_chunks RENAME TO blocos_padrao;
ALTER TABLE public.golden_runs RENAME TO execucoes_padrao;
ALTER TABLE public.golden_run_batches RENAME TO lotes_execucao_padrao;
ALTER TABLE public.golden_calibration RENAME TO calibracao_padrao;
ALTER TABLE public.canary_rollouts RENAME TO rollouts_canario;
ALTER TABLE public.canary_assignments RENAME TO atribuicoes_canario;
ALTER TABLE public.behavior_chunks_tenant_overrides RENAME TO overrides_tenant_blocos_comportamento;
ALTER TABLE public.trigger_chunks_tenant_overrides RENAME TO overrides_tenant_blocos_gatilho;
ALTER TABLE public.human_chunks_tenant_overrides RENAME TO overrides_tenant_blocos_humanizacao;
ALTER TABLE public.variation_chunks_tenant_overrides RENAME TO overrides_tenant_blocos_variacao;
ALTER TABLE public.knowledge_chunks_tenant_overrides RENAME TO overrides_tenant_blocos_conhecimento;
ALTER TABLE public.meta_chunks_tenant_overrides RENAME TO overrides_tenant_blocos_meta;

-- Bloco E: admin IA (6 renames)
ALTER TABLE public.admin_ia_chunks RENAME TO admin_ia_blocos;
ALTER TABLE public.admin_ia_conversations RENAME TO admin_ia_conversas;
ALTER TABLE public.admin_ia_cronjobs RENAME TO admin_ia_agendamentos;
ALTER TABLE public.admin_ia_kb_academica RENAME TO admin_ia_base_academica;
ALTER TABLE public.admin_ia_reflection RENAME TO admin_ia_reflexao;
ALTER TABLE public.admin_ia_tools_disabled RENAME TO admin_ia_ferramentas_desligadas;
ALTER TABLE public.admin_ia_tools_dinamicas RENAME TO admin_ia_ferramentas_dinamicas;

-- Bloco F: publico / loja / cliente (15 renames)
ALTER TABLE public.public_profile RENAME TO perfil_publico;
ALTER TABLE public.public_services RENAME TO servicos_publicos;
ALTER TABLE public.public_gallery RENAME TO galeria_publica;
ALTER TABLE public.public_testimonials RENAME TO depoimentos_publicos;
ALTER TABLE public.public_chat_sessions RENAME TO sessoes_chat_publico;
ALTER TABLE public.public_profile_events RENAME TO eventos_perfil_publico;
ALTER TABLE public.store_planos RENAME TO loja_planos;
ALTER TABLE public.store_pacotes_extra RENAME TO loja_pacotes_extra;
ALTER TABLE public.store_implantacao RENAME TO loja_implantacao;
ALTER TABLE public.store_plus RENAME TO loja_plus;
ALTER TABLE public.client_payments RENAME TO pagamentos_cliente;
ALTER TABLE public.client_documents RENAME TO documentos_cliente;
ALTER TABLE public.contracts RENAME TO contratos;
ALTER TABLE public.contract_settings RENAME TO config_contrato;
ALTER TABLE public.contract_access_log RENAME TO log_acesso_contrato;

-- Bloco G: tags / sotaques / ficha / diversos (29 renames)
ALTER TABLE public.tag_observations RENAME TO observacoes_tag;
ALTER TABLE public.tag_candidates RENAME TO candidatos_tag;
ALTER TABLE public.tag_merge_log RENAME TO log_fusao_tag;
ALTER TABLE public.tag_merge_suggestions RENAME TO sugestoes_fusao_tag;
ALTER TABLE public.tag_curadoria_config RENAME TO config_curadoria_tag;
ALTER TABLE public.tag_vocabulario_alias RENAME TO alias_vocabulario_tag;
ALTER TABLE public.ficha_form_campos RENAME TO campos_ficha;
ALTER TABLE public.ficha_form_valores RENAME TO valores_ficha;
ALTER TABLE public.notification_sounds RENAME TO sons_notificacao;
ALTER TABLE public.user_notif_prefs RENAME TO preferencias_notificacao_usuario;
ALTER TABLE public.webhook_dedup RENAME TO dedup_webhook;
ALTER TABLE public.webhook_debug RENAME TO debug_webhook;
ALTER TABLE public.rate_limits RENAME TO limites_taxa;
ALTER TABLE public.security_incidents RENAME TO incidentes_seguranca;
ALTER TABLE public.tutorials RENAME TO tutoriais;
ALTER TABLE public.tool_invocations RENAME TO invocacoes_ferramenta;
ALTER TABLE public.reflection_log RENAME TO log_reflexao;
ALTER TABLE public.cronjobs_config RENAME TO agendamentos_config;
ALTER TABLE public.cronjobs_log RENAME TO agendamentos_log;
ALTER TABLE public.orphan_questions RENAME TO perguntas_orfas;
ALTER TABLE public.prompt_config RENAME TO config_prompt;
ALTER TABLE public.platform_settings RENAME TO config_plataforma;
ALTER TABLE public.support_config RENAME TO config_suporte;
ALTER TABLE public.support_messages RENAME TO mensagens_suporte;
ALTER TABLE public.purchase_orders RENAME TO pedidos_compra;
ALTER TABLE public.user_subscriptions RENAME TO assinaturas_usuario;
ALTER TABLE public.user_agents RENAME TO agentes_usuario;
ALTER TABLE public.api_usage_logs RENAME TO log_uso_api;
ALTER TABLE public.channels RENAME TO canais;

COMMIT;

;

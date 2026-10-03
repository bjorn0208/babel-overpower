
-- Mark old v1 types as not latest
UPDATE block_type_definitions SET is_latest = false WHERE version = 1;

-- Insert all 28 new block types as version 2
INSERT INTO block_type_definitions (type_slug, name, category, icon, color, config_schema, is_active, is_latest, sort_order, version)
VALUES
-- MENSAGENS (5)
('text_message', 'Texto', 'messages', 'MessageSquare', '#3B82F6', '{"text":{"type":"string","required":true},"typing_delay_ms":{"type":"number","default":1000}}', true, true, 1, 2),
('media', 'Mídia', 'messages', 'Image', '#3B82F6', '{"media_type":{"type":"string","enum":["image","video","audio","gif"],"required":true},"url":{"type":"string"},"caption":{"type":"string"}}', true, true, 2, 2),
('document', 'Documento', 'messages', 'FileText', '#3B82F6', '{"file_url":{"type":"string"},"file_name":{"type":"string"},"caption":{"type":"string"}}', true, true, 3, 2),
('interactive', 'Interativo', 'messages', 'LayoutGrid', '#3B82F6', '{"interactive_type":{"type":"string","enum":["buttons","list"],"required":true},"header":{"type":"string"},"body":{"type":"string","required":true},"options":{"type":"array","required":true},"variable":{"type":"string"}}', true, true, 4, 2),
('send_email', 'Email', 'messages', 'Mail', '#3B82F6', '{"to":{"type":"string","required":true},"subject":{"type":"string","required":true},"body_html":{"type":"string","required":true}}', true, true, 5, 2),
-- ENTRADA (4)
('text_input', 'Input Texto', 'input', 'TextCursorInput', '#F59E0B', '{"input_type":{"type":"string","enum":["text","cpf","cnpj","email","phone","date","number","currency"],"required":true},"variable":{"type":"string","required":true},"prompt_message":{"type":"string","required":true},"error_message":{"type":"string"},"max_attempts":{"type":"number","default":3}}', true, true, 6, 2),
('button_input', 'Botões', 'input', 'ToggleLeft', '#F59E0B', '{"prompt_message":{"type":"string","required":true},"options":{"type":"array","required":true},"variable":{"type":"string","required":true},"allow_multiple":{"type":"boolean","default":false}}', true, true, 7, 2),
('form_input', 'Formulário', 'input', 'ClipboardList', '#F59E0B', '{"fields":{"type":"array","required":true},"submit_message":{"type":"string"}}', true, true, 8, 2),
('file_upload', 'Upload Arquivo', 'input', 'Upload', '#F59E0B', '{"prompt_message":{"type":"string","required":true},"accepted_types":{"type":"array","default":["image/*","application/pdf"]},"max_size_mb":{"type":"number","default":10},"variable":{"type":"string","required":true}}', true, true, 9, 2),
-- IA (3)
('ai_agent', 'Agente IA', 'ai', 'Brain', '#8B5CF6', '{"context_prompt":{"type":"string"},"knowledge_categories":{"type":"array"},"temperature":{"type":"number","default":0.3},"max_tokens":{"type":"number","default":500}}', true, true, 10, 2),
('llm_prompt', 'Prompt LLM', 'ai', 'Sparkles', '#8B5CF6', '{"prompt_template":{"type":"string","required":true},"input_variables":{"type":"array"},"output_variable":{"type":"string","required":true}}', true, true, 11, 2),
('kb_search', 'Busca KB', 'ai', 'Search', '#8B5CF6', '{"categories":{"type":"array"},"query_variable":{"type":"string"},"min_relevance":{"type":"number","default":1.5},"output_variable":{"type":"string","required":true},"limit":{"type":"number","default":5}}', true, true, 12, 2),
-- LOGICA (5)
('condition', 'Condição', 'logic', 'GitBranch', '#EF4444', '{"variable":{"type":"string","required":true},"operator":{"type":"string","enum":["equals","not_equals","contains","not_contains","greater","less","exists","not_exists","regex","in_list"],"required":true},"value":{"type":"string"}}', true, true, 13, 2),
('switch_router', 'Switch', 'logic', 'Route', '#EF4444', '{"variable":{"type":"string","required":true},"cases":{"type":"array","required":true},"default_label":{"type":"string","default":"Outro"}}', true, true, 14, 2),
('set_variable', 'Variável', 'logic', 'Variable', '#EF4444', '{"variable":{"type":"string","required":true},"value":{"type":"string","required":true},"value_type":{"type":"string","enum":["static","expression","variable","js"],"default":"static"}}', true, true, 15, 2),
('code_js', 'Código JS', 'logic', 'Code', '#EF4444', '{"code":{"type":"string","required":true},"input_variables":{"type":"array"},"output_variable":{"type":"string"}}', true, true, 16, 2),
('ab_split', 'A/B Split', 'logic', 'Split', '#EF4444', '{"branches":{"type":"array","required":true}}', true, true, 17, 2),
-- ACOES (6)
('http_request', 'HTTP Request', 'actions', 'Globe', '#10B981', '{"url":{"type":"string","required":true},"method":{"type":"string","enum":["GET","POST","PUT","PATCH","DELETE"],"default":"POST"},"headers":{"type":"object"},"body":{"type":"string"},"response_variable":{"type":"string"}}', true, true, 18, 2),
('update_crm', 'Atualizar CRM', 'actions', 'Database', '#10B981', '{"operation":{"type":"string","enum":["create_lead","update_field","move_stage","create_deal","add_tag","add_note","assign_owner"],"required":true},"fields":{"type":"object"},"stage":{"type":"string"}}', true, true, 19, 2),
('schedule_meeting', 'Agendar Reunião', 'actions', 'Calendar', '#10B981', '{"provider":{"type":"string","default":"google_calendar"},"api_credentials_key":{"type":"string"},"duration_minutes":{"type":"number","default":30},"propose_count":{"type":"number","default":3}}', true, true, 20, 2),
('notify_team', 'Notificar Equipe', 'actions', 'Bell', '#10B981', '{"channel":{"type":"string","enum":["whatsapp","email"],"required":true},"recipients":{"type":"array","required":true},"message_template":{"type":"string","required":true}}', true, true, 21, 2),
('generate_contract', 'Gerar Contrato', 'actions', 'FileSignature', '#10B981', '{"template_html":{"type":"string","required":true},"require_acceptance":{"type":"boolean","default":true},"acceptance_keyword":{"type":"string","default":"ACEITO"},"acceptance_message":{"type":"string","default":"Digite ACEITO para assinar digitalmente este contrato"},"legal_text":{"type":"string","default":"Assinatura eletronica valida conforme MP 2.200-2/2001 art.10 §2 e Lei 14.063/2020"}}', true, true, 22, 2),
('pix_payment', 'Pagamento PIX', 'actions', 'CreditCard', '#10B981', '{"pix_key":{"type":"string","required":true},"pix_key_type":{"type":"string","enum":["cpf","cnpj","email","phone","random"],"required":true},"amount_variable":{"type":"string"},"fixed_amount":{"type":"number"},"description":{"type":"string"},"beneficiary_name":{"type":"string"},"support_whatsapp":{"type":"string","default":"5551920054188"}}', true, true, 23, 2),
-- CONTROLE (5)
('wait', 'Esperar', 'control', 'Clock', '#6366F1', '{"wait_type":{"type":"string","enum":["fixed_time","wait_reply","wait_event","until_time"],"required":true},"duration_seconds":{"type":"number"},"timeout_seconds":{"type":"number"}}', true, true, 24, 2),
('sub_flow', 'Sub-fluxo', 'control', 'Workflow', '#6366F1', '{"target_flow_id":{"type":"string","required":true},"return_after":{"type":"boolean","default":true}}', true, true, 25, 2),
('transfer_human', 'Transferir', 'control', 'UserPlus', '#6366F1', '{"transfer_type":{"type":"string","enum":["any_human","specific_person","team","round_robin"],"required":true},"target_id":{"type":"string"},"message":{"type":"string","default":"Vou transferir voce para um atendente"}}', true, true, 26, 2),
('end_flow', 'Fim', 'control', 'CircleStop', '#6366F1', '{"status":{"type":"string","enum":["success","failure","discard"],"default":"success"},"final_message":{"type":"string"},"update_lead_status":{"type":"string"}}', true, true, 27, 2),
('loop', 'Loop', 'control', 'Repeat', '#6366F1', '{"max_iterations":{"type":"number","default":3,"required":true},"stop_condition_variable":{"type":"string"},"stop_condition_value":{"type":"string"}}', true, true, 28, 2);

;

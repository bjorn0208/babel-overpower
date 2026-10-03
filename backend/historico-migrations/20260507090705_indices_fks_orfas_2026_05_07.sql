-- ============================================================
-- M002-S04 follow-up — criar índice nas 32 FKs sem cobertura
-- 
-- Investigação 2026-05-07 06:12 BRT via pg_constraint + pg_index.
-- Cada CREATE é idempotente (IF NOT EXISTS).
-- Tabelas vazias (0 bytes) ganham índice "preventivo" — custo nulo,
-- elimina 32 entradas do advisor, performance real quando popularem.
-- ============================================================

-- Tabelas com dados (priorizadas por tamanho)
CREATE INDEX IF NOT EXISTS idx_sugestoes_fusao_tag_nicho_id              ON public.sugestoes_fusao_tag (nicho_id);
CREATE INDEX IF NOT EXISTS idx_compromissos_pessoa_responsavel_id        ON public.compromissos (pessoa_responsavel_id);
CREATE INDEX IF NOT EXISTS idx_memoria_lead_created_by                   ON public.memoria_lead (created_by);
CREATE INDEX IF NOT EXISTS idx_auditoria_blocos_executado_por            ON public.auditoria_blocos (executado_por);
CREATE INDEX IF NOT EXISTS idx_regras_operacionais_blocos_criado_por     ON public.regras_operacionais_blocos (criado_por);
CREATE INDEX IF NOT EXISTS idx_vocabulario_curadoria_criado_por          ON public.vocabulario_curadoria (criado_por);
CREATE INDEX IF NOT EXISTS idx_vocabulario_curadoria_nicho_id            ON public.vocabulario_curadoria (nicho_id);
CREATE INDEX IF NOT EXISTS idx_vocabulario_curadoria_tenant_id           ON public.vocabulario_curadoria (tenant_id);
CREATE INDEX IF NOT EXISTS idx_campanhas_product_id                      ON public.campanhas (product_id);

-- Tabelas pequenas (8192 bytes)
CREATE INDEX IF NOT EXISTS idx_acao_pausa_blocos_criado_por              ON public.acao_pausa_blocos (criado_por);
CREATE INDEX IF NOT EXISTS idx_agendamentos_config_criado_por            ON public.agendamentos_config (criado_por);
CREATE INDEX IF NOT EXISTS idx_automacao_blocos_nicho_id                 ON public.automacao_blocos (nicho_id);
CREATE INDEX IF NOT EXISTS idx_automacao_blocos_tenant_id                ON public.automacao_blocos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dicas_dono_criado_por                     ON public.dicas_dono (criado_por);
CREATE INDEX IF NOT EXISTS idx_diretriz_bolha_blocos_nicho_id            ON public.diretriz_bolha_blocos (nicho_id);
CREATE INDEX IF NOT EXISTS idx_disponibilidade_pessoa_id                 ON public.disponibilidade (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_emocao_blocos_nicho_id                    ON public.emocao_blocos (nicho_id);
CREATE INDEX IF NOT EXISTS idx_feriados_brasil_created_by                ON public.feriados_brasil (created_by);
CREATE INDEX IF NOT EXISTS idx_limiares_gatilho_updated_by               ON public.limiares_gatilho (updated_by);
CREATE INDEX IF NOT EXISTS idx_manipulacao_blocos_nicho_id               ON public.manipulacao_blocos (nicho_id);
CREATE INDEX IF NOT EXISTS idx_registro_fusao_tag_nicho_id               ON public.registro_fusao_tag (nicho_id);

-- Tabelas vazias (0 bytes) — preventivo
CREATE INDEX IF NOT EXISTS idx_admin_ia_documentos_ingeridos_ingerido_por ON public.admin_ia_documentos_ingeridos (ingerido_por);
CREATE INDEX IF NOT EXISTS idx_admin_ia_dossies_conversation_id           ON public.admin_ia_dossies (conversation_id);
CREATE INDEX IF NOT EXISTS idx_admin_ia_dossies_iniciado_por              ON public.admin_ia_dossies (iniciado_por);
CREATE INDEX IF NOT EXISTS idx_admin_ia_ferramentas_dinamicas_aprovada_por ON public.admin_ia_ferramentas_dinamicas (aprovada_por);
CREATE INDEX IF NOT EXISTS idx_admin_ia_ferramentas_dinamicas_criada_por  ON public.admin_ia_ferramentas_dinamicas (criada_por);
CREATE INDEX IF NOT EXISTS idx_alias_vocabulario_tag_nicho_id             ON public.alias_vocabulario_tag (nicho_id);
CREATE INDEX IF NOT EXISTS idx_exclusoes_tenant_lead_id                   ON public.exclusoes_tenant (lead_id);
CREATE INDEX IF NOT EXISTS idx_exclusoes_tenant_source_campaign_id        ON public.exclusoes_tenant (source_campaign_id);
CREATE INDEX IF NOT EXISTS idx_sotaques_catalogo_curado_por               ON public.sotaques_catalogo (curado_por);
CREATE INDEX IF NOT EXISTS idx_sotaques_observados_validado_por           ON public.sotaques_observados (validado_por);
CREATE INDEX IF NOT EXISTS idx_valores_ficha_substituido_por_id           ON public.valores_ficha (substituido_por_id);

;

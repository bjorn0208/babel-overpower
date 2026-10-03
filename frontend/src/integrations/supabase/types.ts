export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _migration_rpc_backup: {
        Row: {
          corpo: string
          criado_em: string
          nome: string
        }
        Insert: {
          corpo: string
          criado_em?: string
          nome: string
        }
        Update: {
          corpo?: string
          criado_em?: string
          nome?: string
        }
        Relationships: []
      }
      acao_pausa_blocos: {
        Row: {
          ativo: boolean
          criado_em: string
          criado_por: string | null
          deleted_at: string | null
          duracao_min: number
          embedding_status: string
          escopo: string
          gatilho_descricao: string
          gatilho_falas: Json
          id: string
          mensagem_retorno: string
          nicho_id: string | null
          prioridade: number
          tenant_id: string | null
          tipo_campanha: string | null
          updated_at: string | null
          versao: number
          vetor_semantico: unknown
          vezes_usado: number
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          deleted_at?: string | null
          duracao_min?: number
          embedding_status?: string
          escopo?: string
          gatilho_descricao: string
          gatilho_falas?: Json
          id?: string
          mensagem_retorno: string
          nicho_id?: string | null
          prioridade?: number
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string | null
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          deleted_at?: string | null
          duracao_min?: number
          embedding_status?: string
          escopo?: string
          gatilho_descricao?: string
          gatilho_falas?: Json
          id?: string
          mensagem_retorno?: string
          nicho_id?: string | null
          prioridade?: number
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string | null
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Relationships: [
          {
            foreignKeyName: "acao_pausa_blocos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      acoes_agendadas: {
        Row: {
          action_type: string
          agente_id: string | null
          campaign_id: string | null
          carga: Json | null
          conversation_id: string | null
          created_at: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          lead_id: string | null
          node_name: string | null
          scheduled_at: string
          status: string | null
          template: string | null
          tenant_id: string | null
          tentativas: number
        }
        Insert: {
          action_type: string
          agente_id?: string | null
          campaign_id?: string | null
          carga?: Json | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          node_name?: string | null
          scheduled_at: string
          status?: string | null
          template?: string | null
          tenant_id?: string | null
          tentativas?: number
        }
        Update: {
          action_type?: string
          agente_id?: string | null
          campaign_id?: string | null
          carga?: Json | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          node_name?: string | null
          scheduled_at?: string
          status?: string | null
          template?: string | null
          tenant_id?: string | null
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "acoes_agendadas_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_config_tenant: {
        Row: {
          agente_pode_agendar: boolean
          created_at: string
          duracao_padrao_min: number
          id: string
          lembrete: Json
          meses_a_frente: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agente_pode_agendar?: boolean
          created_at?: string
          duracao_padrao_min?: number
          id?: string
          lembrete?: Json
          meses_a_frente?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agente_pode_agendar?: boolean
          created_at?: string
          duracao_padrao_min?: number
          id?: string
          lembrete?: Json
          meses_a_frente?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_config_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos_config: {
        Row: {
          ativo: boolean
          atualizado_em: string | null
          categoria: string | null
          condicao_sql: string | null
          criado_em: string
          criado_por: string | null
          cron_expr: string | null
          descricao: string | null
          edge_function: string | null
          id: string
          jobid_pg_cron: number | null
          modo: string
          motivo_criacao: string | null
          nome: string
          parametros: Json | null
          proxima_execucao: string | null
          sql_inline: string | null
          ultima_execucao: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string | null
          categoria?: string | null
          condicao_sql?: string | null
          criado_em?: string
          criado_por?: string | null
          cron_expr?: string | null
          descricao?: string | null
          edge_function?: string | null
          id?: string
          jobid_pg_cron?: number | null
          modo: string
          motivo_criacao?: string | null
          nome: string
          parametros?: Json | null
          proxima_execucao?: string | null
          sql_inline?: string | null
          ultima_execucao?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string | null
          categoria?: string | null
          condicao_sql?: string | null
          criado_em?: string
          criado_por?: string | null
          cron_expr?: string | null
          descricao?: string | null
          edge_function?: string | null
          id?: string
          jobid_pg_cron?: number | null
          modo?: string
          motivo_criacao?: string | null
          nome?: string
          parametros?: Json | null
          proxima_execucao?: string | null
          sql_inline?: string | null
          ultima_execucao?: string | null
        }
        Relationships: []
      }
      agendamentos_link: {
        Row: {
          agente_id: string | null
          chave_publica: string
          compromisso_id: string | null
          conversa_id: string | null
          created_at: string
          dados_cliente: Json
          id: string
          lead_id: string | null
          sala_reuniao_id: string | null
          scheduled_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agente_id?: string | null
          chave_publica?: string
          compromisso_id?: string | null
          conversa_id?: string | null
          created_at?: string
          dados_cliente?: Json
          id?: string
          lead_id?: string | null
          sala_reuniao_id?: string | null
          scheduled_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agente_id?: string | null
          chave_publica?: string
          compromisso_id?: string | null
          conversa_id?: string | null
          created_at?: string
          dados_cliente?: Json
          id?: string
          lead_id?: string | null
          sala_reuniao_id?: string | null
          scheduled_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_link_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos_log: {
        Row: {
          cronjob_id: string | null
          cronjob_nome: string
          custo_estimado_usd: number | null
          duracao_ms: number | null
          erro_mensagem: string | null
          http_status: number | null
          id: string
          iniciou_em: string
          payload_input: Json | null
          payload_resposta: Json | null
          registros_processados: number | null
          resultado: string | null
          terminou_em: string | null
        }
        Insert: {
          cronjob_id?: string | null
          cronjob_nome: string
          custo_estimado_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          http_status?: number | null
          id?: string
          iniciou_em?: string
          payload_input?: Json | null
          payload_resposta?: Json | null
          registros_processados?: number | null
          resultado?: string | null
          terminou_em?: string | null
        }
        Update: {
          cronjob_id?: string | null
          cronjob_nome?: string
          custo_estimado_usd?: number | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          http_status?: number | null
          id?: string
          iniciou_em?: string
          payload_input?: Json | null
          payload_resposta?: Json | null
          registros_processados?: number | null
          resultado?: string | null
          terminou_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cronjobs_log_cronjob_id_fkey"
            columns: ["cronjob_id"]
            isOneToOne: false
            referencedRelation: "agendamentos_config"
            referencedColumns: ["id"]
          },
        ]
      }
      agente_cargo: {
        Row: {
          agente_id: string
          ativo: boolean
          atualizado_em: string
          cargo_id: string
          criado_em: string
          id: string
          ordem: number
          overrides_diretrizes: Json
          overrides_tarefas: Json
          rotulo_coluna: string | null
          tenant_id: string
          vira_coluna_kanban: boolean
        }
        Insert: {
          agente_id: string
          ativo?: boolean
          atualizado_em?: string
          cargo_id: string
          criado_em?: string
          id?: string
          ordem?: number
          overrides_diretrizes?: Json
          overrides_tarefas?: Json
          rotulo_coluna?: string | null
          tenant_id: string
          vira_coluna_kanban?: boolean
        }
        Update: {
          agente_id?: string
          ativo?: boolean
          atualizado_em?: string
          cargo_id?: string
          criado_em?: string
          id?: string
          ordem?: number
          overrides_diretrizes?: Json
          overrides_tarefas?: Json
          rotulo_coluna?: string | null
          tenant_id?: string
          vira_coluna_kanban?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agente_cargo_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agente_cargo_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agente_cargo_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
      agente_cargo_overrides: {
        Row: {
          acao: string
          agente_cargo_id: string
          ativo: boolean
          criado_em: string
          descricao: string | null
          id: string
          ordem: number
          ref_catalogo_id: string | null
          tipo: string
          titulo: string | null
        }
        Insert: {
          acao: string
          agente_cargo_id: string
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          ordem?: number
          ref_catalogo_id?: string | null
          tipo: string
          titulo?: string | null
        }
        Update: {
          acao?: string
          agente_cargo_id?: string
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          ordem?: number
          ref_catalogo_id?: string | null
          tipo?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agente_cargo_overrides_agente_cargo_id_fkey"
            columns: ["agente_cargo_id"]
            isOneToOne: false
            referencedRelation: "agente_cargo"
            referencedColumns: ["id"]
          },
        ]
      }
      agente_identidade: {
        Row: {
          agente_id: string
          criado_em: string
          desativada_em: string | null
          dimensao: string
          embedding_status: string
          evidencias_jsonb: Json | null
          id: string
          intensidade: number | null
          motivo_veto: string | null
          origem: string
          raciocinio: string | null
          real_world_valid_from: string | null
          real_world_valid_to: string | null
          status: string
          tenant_desativada: boolean
          tenant_id: string
          texto: string
          vetor_semantico: unknown
        }
        Insert: {
          agente_id: string
          criado_em?: string
          desativada_em?: string | null
          dimensao: string
          embedding_status?: string
          evidencias_jsonb?: Json | null
          id?: string
          intensidade?: number | null
          motivo_veto?: string | null
          origem: string
          raciocinio?: string | null
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          status?: string
          tenant_desativada?: boolean
          tenant_id: string
          texto: string
          vetor_semantico?: unknown
        }
        Update: {
          agente_id?: string
          criado_em?: string
          desativada_em?: string | null
          dimensao?: string
          embedding_status?: string
          evidencias_jsonb?: Json | null
          id?: string
          intensidade?: number | null
          motivo_veto?: string | null
          origem?: string
          raciocinio?: string | null
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          status?: string
          tenant_desativada?: boolean
          tenant_id?: string
          texto?: string
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "agente_identidade_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agente_identidade_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      agentes: {
        Row: {
          atualizado_em: string
          calibragem_recall: Json | null
          configuracao: Json | null
          created_at: string | null
          criado_em: string
          fluxo: Json | null
          id: string
          identidade: Json | null
          is_active: boolean
          max_tokens: number | null
          modelo_porteiro: string | null
          modelo_principal: string | null
          modelo_sintese: string | null
          nicho: string | null
          nicho_id: string | null
          nome_agente: string
          owner_id: string | null
          persona: string | null
          product_flows: Json | null
          prompt_sistema: string | null
          temperatura: number | null
          tom_agente: string
          tom_de_voz: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          calibragem_recall?: Json | null
          configuracao?: Json | null
          created_at?: string | null
          criado_em?: string
          fluxo?: Json | null
          id?: string
          identidade?: Json | null
          is_active?: boolean
          max_tokens?: number | null
          modelo_porteiro?: string | null
          modelo_principal?: string | null
          modelo_sintese?: string | null
          nicho?: string | null
          nicho_id?: string | null
          nome_agente?: string
          owner_id?: string | null
          persona?: string | null
          product_flows?: Json | null
          prompt_sistema?: string | null
          temperatura?: number | null
          tom_agente?: string
          tom_de_voz?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          atualizado_em?: string
          calibragem_recall?: Json | null
          configuracao?: Json | null
          created_at?: string | null
          criado_em?: string
          fluxo?: Json | null
          id?: string
          identidade?: Json | null
          is_active?: boolean
          max_tokens?: number | null
          modelo_porteiro?: string | null
          modelo_principal?: string | null
          modelo_sintese?: string | null
          nicho?: string | null
          nicho_id?: string | null
          nome_agente?: string
          owner_id?: string | null
          persona?: string | null
          product_flows?: Json | null
          prompt_sistema?: string | null
          temperatura?: number | null
          tom_agente?: string
          tom_de_voz?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agentes_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agentes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agentes_delegados: {
        Row: {
          agente_id: string
          criado_em: string
          gestor_user_id: string
        }
        Insert: {
          agente_id: string
          criado_em?: string
          gestor_user_id: string
        }
        Update: {
          agente_id?: string
          criado_em?: string
          gestor_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agentes_delegados_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agentes_delegados_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agentes_delegados_gestor_user_id_fkey"
            columns: ["gestor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alias_vocabulario_tag: {
        Row: {
          alias: string
          chave_canonica: string
          criado_em: string
          escopo: string
          id: string
          nicho_id: string | null
          origem: string
          tenant_id: string | null
          valor_canonico: string
        }
        Insert: {
          alias: string
          chave_canonica: string
          criado_em?: string
          escopo?: string
          id?: string
          nicho_id?: string | null
          origem?: string
          tenant_id?: string | null
          valor_canonico: string
        }
        Update: {
          alias?: string
          chave_canonica?: string
          criado_em?: string
          escopo?: string
          id?: string
          nicho_id?: string | null
          origem?: string
          tenant_id?: string | null
          valor_canonico?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_vocabulario_alias_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_vocabulario_alias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anti_padroes: {
        Row: {
          acao_correta: string
          ativo: boolean
          contexto_que_disparou: string | null
          criado_em: string
          deleted_at: string | null
          embedding_status: string
          escopo: string
          evidencia_lead_ids: string[] | null
          id: string
          nicho_id: string | null
          num_evidencias: number
          origem: string
          por_que: string | null
          real_world_valid_from: string | null
          real_world_valid_to: string | null
          situacao: string
          tenant_id: string | null
          tipo_campanha: string | null
          updated_at: string | null
          vetor_semantico: unknown
        }
        Insert: {
          acao_correta: string
          ativo?: boolean
          contexto_que_disparou?: string | null
          criado_em?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          evidencia_lead_ids?: string[] | null
          id?: string
          nicho_id?: string | null
          num_evidencias?: number
          origem?: string
          por_que?: string | null
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          situacao: string
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string | null
          vetor_semantico?: unknown
        }
        Update: {
          acao_correta?: string
          ativo?: boolean
          contexto_que_disparou?: string | null
          criado_em?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          evidencia_lead_ids?: string[] | null
          id?: string
          nicho_id?: string | null
          num_evidencias?: number
          origem?: string
          por_que?: string | null
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          situacao?: string
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string | null
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "anti_padroes_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      apis_externas: {
        Row: {
          ativo: boolean
          atualizado_em: string
          auth_storage: string | null
          categoria: string | null
          criado_em: string
          descricao: string | null
          edge_associada: string | null
          frequencia: string
          id: string
          nome: string
          requer_auth: boolean
          slug: string
          ultima_execucao_em: string | null
          url_base: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          auth_storage?: string | null
          categoria?: string | null
          criado_em?: string
          descricao?: string | null
          edge_associada?: string | null
          frequencia?: string
          id?: string
          nome: string
          requer_auth?: boolean
          slug: string
          ultima_execucao_em?: string | null
          url_base: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          auth_storage?: string | null
          categoria?: string | null
          criado_em?: string
          descricao?: string | null
          edge_associada?: string | null
          frequencia?: string
          id?: string
          nome?: string
          requer_auth?: boolean
          slug?: string
          ultima_execucao_em?: string | null
          url_base?: string
        }
        Relationships: []
      }
      aplicativos_instalados: {
        Row: {
          aplicativo_id: string
          aplicativo_slug: string
          id: string
          instalado_em: string
          user_id: string
        }
        Insert: {
          aplicativo_id: string
          aplicativo_slug: string
          id?: string
          instalado_em?: string
          user_id: string
        }
        Update: {
          aplicativo_id?: string
          aplicativo_slug?: string
          id?: string
          instalado_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aplicativos_instalados_aplicativo_fkey"
            columns: ["aplicativo_id"]
            isOneToOne: false
            referencedRelation: "loja_aplicativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicativos_instalados_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicativos_nicho: {
        Row: {
          aplicativo_id: string
          created_at: string
          id: string
          nicho_id: string
        }
        Insert: {
          aplicativo_id: string
          created_at?: string
          id?: string
          nicho_id: string
        }
        Update: {
          aplicativo_id?: string
          created_at?: string
          id?: string
          nicho_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aplicativos_nicho_aplicativo_id_fkey"
            columns: ["aplicativo_id"]
            isOneToOne: false
            referencedRelation: "loja_aplicativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicativos_nicho_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      arquivos_textos: {
        Row: {
          conteudo: string
          created_at: string
          deleted_at: string | null
          id: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          titulo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_textos_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_usuario: {
        Row: {
          conversas_usadas: number
          created_at: string | null
          data_expiracao: string
          data_inicio: string
          id: string
          max_ciclos_por_conversa: number
          max_conversas: number
          max_storage_bytes: number
          observacao: string | null
          plano_id: string | null
          plano_nome: string
          preco: number
          status: string
          storage_used_bytes: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conversas_usadas?: number
          created_at?: string | null
          data_expiracao?: string
          data_inicio?: string
          id?: string
          max_ciclos_por_conversa?: number
          max_conversas?: number
          max_storage_bytes?: number
          observacao?: string | null
          plano_id?: string | null
          plano_nome?: string
          preco?: number
          status?: string
          storage_used_bytes?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conversas_usadas?: number
          created_at?: string | null
          data_expiracao?: string
          data_inicio?: string
          id?: string
          max_ciclos_por_conversa?: number
          max_conversas?: number
          max_storage_bytes?: number
          observacao?: string | null
          plano_id?: string | null
          plano_nome?: string
          preco?: number
          status?: string
          storage_used_bytes?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_usuario_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "loja_planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_usuario_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      atribuicoes_canario: {
        Row: {
          atribuido_em: string
          canary_id: string
          conversation_id: string | null
          id: string
          variante: string
        }
        Insert: {
          atribuido_em?: string
          canary_id: string
          conversation_id?: string | null
          id?: string
          variante: string
        }
        Update: {
          atribuido_em?: string
          canary_id?: string
          conversation_id?: string | null
          id?: string
          variante?: string
        }
        Relationships: [
          {
            foreignKeyName: "atribuicoes_canario_canary_id_fkey"
            columns: ["canary_id"]
            isOneToOne: false
            referencedRelation: "rollouts_canario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atribuicoes_canario_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_blocos: {
        Row: {
          acao: string
          antes: Json | null
          bloco_id: string | null
          bytes_adicionados: number | null
          bytes_removidos: number | null
          depois: Json | null
          executado_em: string | null
          executado_por: string | null
          executado_via: string | null
          id: string
          motivo: string | null
          tabela: string
        }
        Insert: {
          acao: string
          antes?: Json | null
          bloco_id?: string | null
          bytes_adicionados?: number | null
          bytes_removidos?: number | null
          depois?: Json | null
          executado_em?: string | null
          executado_por?: string | null
          executado_via?: string | null
          id?: string
          motivo?: string | null
          tabela: string
        }
        Update: {
          acao?: string
          antes?: Json | null
          bloco_id?: string | null
          bytes_adicionados?: number | null
          bytes_removidos?: number | null
          depois?: Json | null
          executado_em?: string | null
          executado_por?: string | null
          executado_via?: string | null
          id?: string
          motivo?: string | null
          tabela?: string
        }
        Relationships: []
      }
      auditoria_conversa: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          conversation_id: string
          id: string
          is_service_role: boolean | null
          new_agent_enabled: boolean | null
          new_status: string | null
          old_agent_enabled: boolean | null
          old_status: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          conversation_id: string
          id?: string
          is_service_role?: boolean | null
          new_agent_enabled?: boolean | null
          new_status?: string | null
          old_agent_enabled?: boolean | null
          old_status?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          conversation_id?: string
          id?: string
          is_service_role?: boolean | null
          new_agent_enabled?: boolean | null
          new_status?: string | null
          old_agent_enabled?: boolean | null
          old_status?: string | null
        }
        Relationships: []
      }
      auditoria_groundedness: {
        Row: {
          blocos_citados: string[]
          blocos_recuperados: string[]
          bolha_indice: number
          conversa_id: string
          criado_em: string
          custo_tokens_in: number | null
          custo_tokens_out: number | null
          id: string
          latencia_auditor_ms: number | null
          modelo_auditor: string
          motivo_reprovacao: string | null
          rounds_executados: number
          tenant_id: string
          texto_bolha: string
          turno_id: string | null
          veredito_auditor: string
        }
        Insert: {
          blocos_citados?: string[]
          blocos_recuperados?: string[]
          bolha_indice: number
          conversa_id: string
          criado_em?: string
          custo_tokens_in?: number | null
          custo_tokens_out?: number | null
          id?: string
          latencia_auditor_ms?: number | null
          modelo_auditor: string
          motivo_reprovacao?: string | null
          rounds_executados?: number
          tenant_id: string
          texto_bolha: string
          turno_id?: string | null
          veredito_auditor: string
        }
        Update: {
          blocos_citados?: string[]
          blocos_recuperados?: string[]
          bolha_indice?: number
          conversa_id?: string
          criado_em?: string
          custo_tokens_in?: number | null
          custo_tokens_out?: number | null
          id?: string
          latencia_auditor_ms?: number | null
          modelo_auditor?: string
          motivo_reprovacao?: string | null
          rounds_executados?: number
          tenant_id?: string
          texto_bolha?: string
          turno_id?: string | null
          veredito_auditor?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_groundedness_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_groundedness_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automacao_blocos: {
        Row: {
          ativo: boolean
          carga: Json
          cenario: string
          condicao_extra: Json
          created_at: string
          descricao: string
          embedding_status: string
          escopo: string
          id: string
          nicho_id: string | null
          nome: string
          tenant_id: string | null
          updated_at: string
          vetor_semantico: unknown
        }
        Insert: {
          ativo?: boolean
          carga?: Json
          cenario: string
          condicao_extra?: Json
          created_at?: string
          descricao: string
          embedding_status?: string
          escopo?: string
          id?: string
          nicho_id?: string | null
          nome: string
          tenant_id?: string | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Update: {
          ativo?: boolean
          carga?: Json
          cenario?: string
          condicao_extra?: Json
          created_at?: string
          descricao?: string
          embedding_status?: string
          escopo?: string
          id?: string
          nicho_id?: string | null
          nome?: string
          tenant_id?: string | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "automacao_blocos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automacao_blocos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_curadoria: {
        Row: {
          acao_sugerida_payload: Json | null
          acao_sugerida_tipo: string | null
          arquivado_em: string | null
          arquivado_por: string | null
          atualizado_em: string
          autor_tipo: string
          bloco_origem_id: string | null
          bloco_origem_tabela: string | null
          cargo_id: string | null
          conteudo_busca: unknown
          contexto_aba: string | null
          criado_em: string
          criado_por: string | null
          deleted_at: string | null
          embedding_status: string
          escopo: string
          id: string
          lido_em: string | null
          lido_por: string | null
          mensagem: string
          nicho_id: string | null
          severidade: string
          tenant_id: string | null
          titulo: string
          vetor_semantico: unknown
        }
        Insert: {
          acao_sugerida_payload?: Json | null
          acao_sugerida_tipo?: string | null
          arquivado_em?: string | null
          arquivado_por?: string | null
          atualizado_em?: string
          autor_tipo: string
          bloco_origem_id?: string | null
          bloco_origem_tabela?: string | null
          cargo_id?: string | null
          conteudo_busca?: unknown
          contexto_aba?: string | null
          criado_em?: string
          criado_por?: string | null
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          id?: string
          lido_em?: string | null
          lido_por?: string | null
          mensagem: string
          nicho_id?: string | null
          severidade?: string
          tenant_id?: string | null
          titulo: string
          vetor_semantico?: unknown
        }
        Update: {
          acao_sugerida_payload?: Json | null
          acao_sugerida_tipo?: string | null
          arquivado_em?: string | null
          arquivado_por?: string | null
          atualizado_em?: string
          autor_tipo?: string
          bloco_origem_id?: string | null
          bloco_origem_tabela?: string | null
          cargo_id?: string | null
          conteudo_busca?: unknown
          contexto_aba?: string | null
          criado_em?: string
          criado_por?: string | null
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          id?: string
          lido_em?: string | null
          lido_por?: string | null
          mensagem?: string
          nicho_id?: string | null
          severidade?: string
          tenant_id?: string | null
          titulo?: string
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "avisos_curadoria_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_curadoria_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      base_segmentos: {
        Row: {
          atualizado_contagem_em: string | null
          contagem_leads: number | null
          criado_em: string
          descricao: string | null
          filtros: Json
          id: string
          nome: string
          tenant_id: string
        }
        Insert: {
          atualizado_contagem_em?: string | null
          contagem_leads?: number | null
          criado_em?: string
          descricao?: string | null
          filtros?: Json
          id?: string
          nome: string
          tenant_id: string
        }
        Update: {
          atualizado_contagem_em?: string | null
          contagem_leads?: number | null
          criado_em?: string
          descricao?: string | null
          filtros?: Json
          id?: string
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "base_segmentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos_comportamento: {
        Row: {
          ativo: boolean
          cargo_id: string | null
          categoria: string | null
          created_at: string
          deleted_at: string | null
          embedding_status: string
          escopo: string
          id: string
          instrucao: string
          nicho_id: string | null
          objetivo_campanha: string | null
          origem: string
          prioridade: number
          produto_id: string | null
          situacao_descricao: string
          subcategoria: string | null
          tags: string[]
          tenant_id: string | null
          tipo_campanha: string | null
          trigger_acao: string | null
          updated_at: string
          versao: number
          vetor_semantico: unknown
          vezes_usado: number
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
          categoria?: string | null
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo: string
          id?: string
          instrucao: string
          nicho_id?: string | null
          objetivo_campanha?: string | null
          origem: string
          prioridade?: number
          produto_id?: string | null
          situacao_descricao: string
          subcategoria?: string | null
          tags?: string[]
          tenant_id?: string | null
          tipo_campanha?: string | null
          trigger_acao?: string | null
          updated_at?: string
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
          categoria?: string | null
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          id?: string
          instrucao?: string
          nicho_id?: string | null
          objetivo_campanha?: string | null
          origem?: string
          prioridade?: number
          produto_id?: string | null
          situacao_descricao?: string
          subcategoria?: string | null
          tags?: string[]
          tenant_id?: string | null
          tipo_campanha?: string | null
          trigger_acao?: string | null
          updated_at?: string
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Relationships: [
          {
            foreignKeyName: "blocos_comportamento_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_comportamento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_comportamento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos_conhecimento: {
        Row: {
          agente_id: string | null
          ativo: boolean
          cargo_id: string | null
          category: string | null
          content: string
          created_at: string | null
          deleted_at: string | null
          embedding_status: string
          escopo: string
          fts: unknown
          id: string
          nicho_id: string | null
          tag: string | null
          tags: string[] | null
          tipo: string | null
          title: string
          updated_at: string
          vetor_semantico: unknown
        }
        Insert: {
          agente_id?: string | null
          ativo?: boolean
          cargo_id?: string | null
          category?: string | null
          content: string
          created_at?: string | null
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          fts?: unknown
          id?: string
          nicho_id?: string | null
          tag?: string | null
          tags?: string[] | null
          tipo?: string | null
          title: string
          updated_at?: string
          vetor_semantico?: unknown
        }
        Update: {
          agente_id?: string | null
          ativo?: boolean
          cargo_id?: string | null
          category?: string | null
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          fts?: unknown
          id?: string
          nicho_id?: string | null
          tag?: string | null
          tags?: string[] | null
          tipo?: string | null
          title?: string
          updated_at?: string
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "blocos_conhecimento_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos_gatilho: {
        Row: {
          acao_disparada: string
          acao_payload: Json
          ativo: boolean
          cargo_id: string | null
          categoria: string | null
          condicao_tipo: string
          created_at: string
          deleted_at: string | null
          embedding_status: string
          escopo: string
          exemplo_frase: string
          fase_aplicavel: string | null
          id: string
          nicho_id: string | null
          nome_trigger: string
          objetivo_campanha: string | null
          subcategoria: string | null
          tempo_aguardar_minutos: number | null
          tenant_id: string | null
          tipo_campanha: string | null
          updated_at: string
          vetor_semantico: unknown
        }
        Insert: {
          acao_disparada: string
          acao_payload?: Json
          ativo?: boolean
          cargo_id?: string | null
          categoria?: string | null
          condicao_tipo?: string
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          exemplo_frase: string
          fase_aplicavel?: string | null
          id?: string
          nicho_id?: string | null
          nome_trigger: string
          objetivo_campanha?: string | null
          subcategoria?: string | null
          tempo_aguardar_minutos?: number | null
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Update: {
          acao_disparada?: string
          acao_payload?: Json
          ativo?: boolean
          cargo_id?: string | null
          categoria?: string | null
          condicao_tipo?: string
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          exemplo_frase?: string
          fase_aplicavel?: string | null
          id?: string
          nicho_id?: string | null
          nome_trigger?: string
          objetivo_campanha?: string | null
          subcategoria?: string | null
          tempo_aguardar_minutos?: number | null
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "blocos_gatilho_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_gatilho_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos_humanizacao: {
        Row: {
          ativo: boolean
          cargo_id: string | null
          categoria: string
          contexto_uso: string
          created_at: string
          deleted_at: string | null
          embedding_status: string
          escopo: string
          exemplos_bons: string[]
          exemplos_ruins: string[]
          id: string
          nicho_id: string | null
          objetivo_campanha: string | null
          prioridade: number
          quando_nao_usar: string | null
          regra: string
          subcategoria: string | null
          tags_persona: string[]
          tenant_id: string | null
          tipo_campanha: string | null
          updated_at: string
          vetor_semantico: unknown
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
          categoria: string
          contexto_uso: string
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          exemplos_bons?: string[]
          exemplos_ruins?: string[]
          id?: string
          nicho_id?: string | null
          objetivo_campanha?: string | null
          prioridade?: number
          quando_nao_usar?: string | null
          regra: string
          subcategoria?: string | null
          tags_persona?: string[]
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
          categoria?: string
          contexto_uso?: string
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          exemplos_bons?: string[]
          exemplos_ruins?: string[]
          id?: string
          nicho_id?: string | null
          objetivo_campanha?: string | null
          prioridade?: number
          quando_nao_usar?: string | null
          regra?: string
          subcategoria?: string | null
          tags_persona?: string[]
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "blocos_humanizacao_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_humanizacao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos_meta: {
        Row: {
          ativo: boolean
          cargo_id: string | null
          citacao_kb: string | null
          corpo: string
          created_at: string
          deleted_at: string | null
          embedding_status: string
          escopo: string
          id: string
          imutavel: boolean
          nicho_id: string | null
          objetivo_campanha: string | null
          origem: string
          prioridade: number
          stability_tier: string
          superseded_by: string | null
          tag: string
          tags: string[]
          tenant_id: string | null
          tipo_campanha: string | null
          updated_at: string
          versao: number
          vetor_semantico: unknown
          vezes_usado: number
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
          citacao_kb?: string | null
          corpo: string
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo: string
          id?: string
          imutavel?: boolean
          nicho_id?: string | null
          objetivo_campanha?: string | null
          origem?: string
          prioridade?: number
          stability_tier?: string
          superseded_by?: string | null
          tag: string
          tags?: string[]
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
          citacao_kb?: string | null
          corpo?: string
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          id?: string
          imutavel?: boolean
          nicho_id?: string | null
          objetivo_campanha?: string | null
          origem?: string
          prioridade?: number
          stability_tier?: string
          superseded_by?: string | null
          tag?: string
          tags?: string[]
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Relationships: [
          {
            foreignKeyName: "blocos_meta_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_meta_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "blocos_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_meta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos_padrao: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          deleted_at: string | null
          descricao: string | null
          escopo: string
          id: string
          intent: string | null
          mensagens: Json
          nicho_id: string | null
          persona_simulada: string | null
          resultado_esperado: Json
          tags: string[]
          tenant_id: string | null
          titulo: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          deleted_at?: string | null
          descricao?: string | null
          escopo?: string
          id?: string
          intent?: string | null
          mensagens?: Json
          nicho_id?: string | null
          persona_simulada?: string | null
          resultado_esperado?: Json
          tags?: string[]
          tenant_id?: string | null
          titulo: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          deleted_at?: string | null
          descricao?: string | null
          escopo?: string
          id?: string
          intent?: string | null
          mensagens?: Json
          nicho_id?: string | null
          persona_simulada?: string | null
          resultado_esperado?: Json
          tags?: string[]
          tenant_id?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocos_padrao_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_padrao_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_padrao_persona_simulada_fkey"
            columns: ["persona_simulada"]
            isOneToOne: false
            referencedRelation: "agente_identidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_padrao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos_procedurais: {
        Row: {
          ativo: boolean
          cargo_id: string | null
          citacao_kb: string | null
          created_at: string
          deleted_at: string | null
          embedding_status: string
          escopo: string
          id: string
          imutavel: boolean
          nicho_id: string | null
          nome_procedimento: string
          passos: Json
          prioridade: number
          tenant_id: string | null
          updated_at: string
          versao: number
          vetor_semantico: unknown
          vezes_usado: number
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
          citacao_kb?: string | null
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo: string
          id?: string
          imutavel?: boolean
          nicho_id?: string | null
          nome_procedimento: string
          passos?: Json
          prioridade?: number
          tenant_id?: string | null
          updated_at?: string
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
          citacao_kb?: string | null
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          id?: string
          imutavel?: boolean
          nicho_id?: string | null
          nome_procedimento?: string
          passos?: Json
          prioridade?: number
          tenant_id?: string | null
          updated_at?: string
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Relationships: [
          {
            foreignKeyName: "blocos_procedurais_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_procedurais_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos_variacao: {
        Row: {
          ativo: boolean
          cargo_id: string | null
          categoria: string | null
          created_at: string
          deleted_at: string | null
          embedding_status: string
          escopo: string
          id: string
          instrucao: string
          nicho_id: string | null
          nome_variation: string
          objetivo_campanha: string | null
          prioridade: number | null
          subcategoria: string | null
          tenant_id: string | null
          tipo_campanha: string | null
          updated_at: string
          vetor_semantico: unknown
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
          categoria?: string | null
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          id?: string
          instrucao: string
          nicho_id?: string | null
          nome_variation: string
          objetivo_campanha?: string | null
          prioridade?: number | null
          subcategoria?: string | null
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
          categoria?: string | null
          created_at?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          id?: string
          instrucao?: string
          nicho_id?: string | null
          nome_variation?: string
          objetivo_campanha?: string | null
          prioridade?: number | null
          subcategoria?: string | null
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "blocos_variacao_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocos_variacao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boosts_categoria: {
        Row: {
          ativo: boolean | null
          boost_score: number
          categoria: string
          criado_em: string | null
          id: string
          intent: string
          posicao: string
        }
        Insert: {
          ativo?: boolean | null
          boost_score: number
          categoria: string
          criado_em?: string | null
          id?: string
          intent: string
          posicao: string
        }
        Update: {
          ativo?: boolean | null
          boost_score?: number
          categoria?: string
          criado_em?: string | null
          id?: string
          intent?: string
          posicao?: string
        }
        Relationships: []
      }
      branding_sistema: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cor_acento: string
          cor_acento_secundaria: string
          cor_fundo: string
          criado_em: string
          favicon_url: string | null
          id: string
          login_copyright: string | null
          login_features: Json | null
          login_form_subtitulo: string | null
          login_form_titulo: string | null
          logo_url: string | null
          mensagem_login_sub: string | null
          mensagem_login_titulo: string | null
          nome_curto: string
          nome_produto: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cor_acento?: string
          cor_acento_secundaria?: string
          cor_fundo?: string
          criado_em?: string
          favicon_url?: string | null
          id?: string
          login_copyright?: string | null
          login_features?: Json | null
          login_form_subtitulo?: string | null
          login_form_titulo?: string | null
          logo_url?: string | null
          mensagem_login_sub?: string | null
          mensagem_login_titulo?: string | null
          nome_curto?: string
          nome_produto?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cor_acento?: string
          cor_acento_secundaria?: string
          cor_fundo?: string
          criado_em?: string
          favicon_url?: string | null
          id?: string
          login_copyright?: string | null
          login_features?: Json | null
          login_form_subtitulo?: string | null
          login_form_titulo?: string | null
          logo_url?: string | null
          mensagem_login_sub?: string | null
          mensagem_login_titulo?: string | null
          nome_curto?: string
          nome_produto?: string
        }
        Relationships: []
      }
      buffer_mensagens: {
        Row: {
          agente_id: string
          channel_id: string
          created_at: string
          first_at: string
          id: string
          is_composing: boolean
          last_activity_at: string
          mensagens: Json
          phone: string
          processed: boolean
        }
        Insert: {
          agente_id: string
          channel_id: string
          created_at?: string
          first_at?: string
          id?: string
          is_composing?: boolean
          last_activity_at?: string
          mensagens?: Json
          phone: string
          processed?: boolean
        }
        Update: {
          agente_id?: string
          channel_id?: string
          created_at?: string
          first_at?: string
          id?: string
          is_composing?: boolean
          last_activity_at?: string
          mensagens?: Json
          phone?: string
          processed?: boolean
        }
        Relationships: []
      }
      cache_kv: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      caixa_saida_mensagens: {
        Row: {
          bubble_order: number
          carga: Json
          content: string
          conversation_id: string
          created_at: string
          delay_calculado_ms: number | null
          dispatched_at: string | null
          engagement_level: string | null
          error_reason: string | null
          id: string
          retries: number
          scheduled_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bubble_order?: number
          carga?: Json
          content: string
          conversation_id: string
          created_at?: string
          delay_calculado_ms?: number | null
          dispatched_at?: string | null
          engagement_level?: string | null
          error_reason?: string | null
          id?: string
          retries?: number
          scheduled_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bubble_order?: number
          carga?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          delay_calculado_ms?: number | null
          dispatched_at?: string | null
          engagement_level?: string | null
          error_reason?: string | null
          id?: string
          retries?: number
          scheduled_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caixa_saida_mensagens_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      calibracao_padrao: {
        Row: {
          batch_id: string | null
          conversation_id: string | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          humano_label: string | null
          humano_score: number | null
          id: string
          message_id: string
          verificador_label: string | null
          verificador_score: number | null
        }
        Insert: {
          batch_id?: string | null
          conversation_id?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          humano_label?: string | null
          humano_score?: number | null
          id?: string
          message_id: string
          verificador_label?: string | null
          verificador_score?: number | null
        }
        Update: {
          batch_id?: string | null
          conversation_id?: string | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          humano_label?: string | null
          humano_score?: number | null
          id?: string
          message_id?: string
          verificador_label?: string | null
          verificador_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golden_calibration_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golden_calibration_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golden_calibration_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          ab_test_config: Json | null
          attempt_thresholds: Json | null
          created_at: string
          deleted_at: string | null
          description: string
          desistance_phrases: string[]
          desistance_silence_days: number
          duration_mode: string
          ends_at: string | null
          filters: Json
          id: string
          name: string
          objective: string
          pos_venda_dias_apos_compra: number | null
          product_id: string | null
          recurrence: Json | null
          response_actions: string[]
          skip_holidays: boolean
          starts_at: string
          status: string
          tenant_id: string
          throttle_per_day: number | null
          throttle_per_hour: number | null
          type: string
          updated_at: string
          weekdays: number[]
          window_end: string
          window_start: string
        }
        Insert: {
          ab_test_config?: Json | null
          attempt_thresholds?: Json | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          desistance_phrases?: string[]
          desistance_silence_days?: number
          duration_mode: string
          ends_at?: string | null
          filters?: Json
          id?: string
          name: string
          objective: string
          pos_venda_dias_apos_compra?: number | null
          product_id?: string | null
          recurrence?: Json | null
          response_actions?: string[]
          skip_holidays?: boolean
          starts_at?: string
          status?: string
          tenant_id: string
          throttle_per_day?: number | null
          throttle_per_hour?: number | null
          type: string
          updated_at?: string
          weekdays?: number[]
          window_end?: string
          window_start?: string
        }
        Update: {
          ab_test_config?: Json | null
          attempt_thresholds?: Json | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          desistance_phrases?: string[]
          desistance_silence_days?: number
          duration_mode?: string
          ends_at?: string | null
          filters?: Json
          id?: string
          name?: string
          objective?: string
          pos_venda_dias_apos_compra?: number | null
          product_id?: string | null
          recurrence?: Json | null
          response_actions?: string[]
          skip_holidays?: boolean
          starts_at?: string
          status?: string
          tenant_id?: string
          throttle_per_day?: number | null
          throttle_per_hour?: number | null
          type?: string
          updated_at?: string
          weekdays?: number[]
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campos_ficha: {
        Row: {
          ativo: boolean
          chave: string
          created_at: string
          deleted_at: string | null
          descricao: string | null
          id: string
          nicho_id: string
          obrigatorio: boolean
          opcoes: Json | null
          ordem: number
          placeholder: string | null
          rotulo: string
          secao: string
          sub_campos: Json | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          created_at?: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          nicho_id: string
          obrigatorio?: boolean
          opcoes?: Json | null
          ordem?: number
          placeholder?: string | null
          rotulo: string
          secao?: string
          sub_campos?: Json | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          created_at?: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          nicho_id?: string
          obrigatorio?: boolean
          opcoes?: Json | null
          ordem?: number
          placeholder?: string | null
          rotulo?: string
          secao?: string
          sub_campos?: Json | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ficha_form_campos_niche_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      canais: {
        Row: {
          bubble_split_enabled: boolean
          chip_connected_since: string | null
          chip_maturity_tier: string | null
          chip_observacao: string | null
          created_at: string
          humanize_base_delay_ms: number
          humanize_enabled: boolean
          humanize_max_delay_ms: number
          humanize_min_delay_ms: number
          id: string
          ig_account_id: string | null
          ig_token: string | null
          ig_username: string | null
          is_active: boolean
          max_messages_per_hour_override: number | null
          message_grouping_delay_ms: number
          type: string
          updated_at: string
          url_foto_perfil: string | null
          user_id: string
          whatsapp_phone: string | null
          zapi_api_url: string | null
          zapi_instance_id: string
          zapi_security_token: string
          zapi_token: string
        }
        Insert: {
          bubble_split_enabled?: boolean
          chip_connected_since?: string | null
          chip_maturity_tier?: string | null
          chip_observacao?: string | null
          created_at?: string
          humanize_base_delay_ms?: number
          humanize_enabled?: boolean
          humanize_max_delay_ms?: number
          humanize_min_delay_ms?: number
          id?: string
          ig_account_id?: string | null
          ig_token?: string | null
          ig_username?: string | null
          is_active?: boolean
          max_messages_per_hour_override?: number | null
          message_grouping_delay_ms?: number
          type?: string
          updated_at?: string
          url_foto_perfil?: string | null
          user_id: string
          whatsapp_phone?: string | null
          zapi_api_url?: string | null
          zapi_instance_id?: string
          zapi_security_token?: string
          zapi_token?: string
        }
        Update: {
          bubble_split_enabled?: boolean
          chip_connected_since?: string | null
          chip_maturity_tier?: string | null
          chip_observacao?: string | null
          created_at?: string
          humanize_base_delay_ms?: number
          humanize_enabled?: boolean
          humanize_max_delay_ms?: number
          humanize_min_delay_ms?: number
          id?: string
          ig_account_id?: string | null
          ig_token?: string | null
          ig_username?: string | null
          is_active?: boolean
          max_messages_per_hour_override?: number | null
          message_grouping_delay_ms?: number
          type?: string
          updated_at?: string
          url_foto_perfil?: string | null
          user_id?: string
          whatsapp_phone?: string | null
          zapi_api_url?: string | null
          zapi_instance_id?: string
          zapi_security_token?: string
          zapi_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidatos_bloco: {
        Row: {
          atualizado_em: string
          categoria_sugerida: string | null
          contexto: string | null
          conversation_id: string | null
          criado_em: string
          decided_at: string | null
          decided_by: string | null
          evidencia_lead_ids: string[]
          excerto: string
          id: string
          lead_id: string | null
          motivo_rejeicao: string | null
          num_leads_independentes: number
          promoted_bloco_id: string | null
          promoted_bloco_table: string | null
          status: string
          tenant_id: string
          tipo_sugerido: string | null
        }
        Insert: {
          atualizado_em?: string
          categoria_sugerida?: string | null
          contexto?: string | null
          conversation_id?: string | null
          criado_em?: string
          decided_at?: string | null
          decided_by?: string | null
          evidencia_lead_ids?: string[]
          excerto: string
          id?: string
          lead_id?: string | null
          motivo_rejeicao?: string | null
          num_leads_independentes?: number
          promoted_bloco_id?: string | null
          promoted_bloco_table?: string | null
          status?: string
          tenant_id: string
          tipo_sugerido?: string | null
        }
        Update: {
          atualizado_em?: string
          categoria_sugerida?: string | null
          contexto?: string | null
          conversation_id?: string | null
          criado_em?: string
          decided_at?: string | null
          decided_by?: string | null
          evidencia_lead_ids?: string[]
          excerto?: string
          id?: string
          lead_id?: string | null
          motivo_rejeicao?: string | null
          num_leads_independentes?: number
          promoted_bloco_id?: string | null
          promoted_bloco_table?: string | null
          status?: string
          tenant_id?: string
          tipo_sugerido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidatos_bloco_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_bloco_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_bloco_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_bloco_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidatos_tag: {
        Row: {
          atualizado_em: string
          chave_canonica: string | null
          criado_em: string
          dado_origem: string | null
          embedded_at: string | null
          evidencia_lead_ids: string[]
          id: string
          nicho_id: string | null
          normalizado_em: string | null
          num_leads_independentes: number
          num_observacoes: number
          origem: string
          promoted_at: string | null
          status: string
          tag_text: string
          tenant_id: string | null
          valor_canonico: string | null
          vetor_semantico: unknown
          vocabulario_id: string | null
        }
        Insert: {
          atualizado_em?: string
          chave_canonica?: string | null
          criado_em?: string
          dado_origem?: string | null
          embedded_at?: string | null
          evidencia_lead_ids?: string[]
          id?: string
          nicho_id?: string | null
          normalizado_em?: string | null
          num_leads_independentes?: number
          num_observacoes?: number
          origem?: string
          promoted_at?: string | null
          status?: string
          tag_text: string
          tenant_id?: string | null
          valor_canonico?: string | null
          vetor_semantico?: unknown
          vocabulario_id?: string | null
        }
        Update: {
          atualizado_em?: string
          chave_canonica?: string | null
          criado_em?: string
          dado_origem?: string | null
          embedded_at?: string | null
          evidencia_lead_ids?: string[]
          id?: string
          nicho_id?: string | null
          normalizado_em?: string | null
          num_leads_independentes?: number
          num_observacoes?: number
          origem?: string
          promoted_at?: string | null
          status?: string
          tag_text?: string
          tenant_id?: string | null
          valor_canonico?: string | null
          vetor_semantico?: unknown
          vocabulario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidatos_tag_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_tag_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_tag_vocabulario_id_fkey"
            columns: ["vocabulario_id"]
            isOneToOne: false
            referencedRelation: "vocabulario_curadoria"
            referencedColumns: ["id"]
          },
        ]
      }
      cargo_diretrizes: {
        Row: {
          ativo: boolean
          cargo_id: string
          criado_em: string
          descricao: string | null
          id: string
          ordem: number
          titulo: string
        }
        Insert: {
          ativo?: boolean
          cargo_id: string
          criado_em?: string
          descricao?: string | null
          id?: string
          ordem?: number
          titulo: string
        }
        Update: {
          ativo?: boolean
          cargo_id?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          ordem?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargo_diretrizes_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
      cargo_ferramentas: {
        Row: {
          cargo_id: string
          criado_em: string
          ferramenta_id: string
          obrigatoria: boolean
          ordem: number
        }
        Insert: {
          cargo_id: string
          criado_em?: string
          ferramenta_id: string
          obrigatoria?: boolean
          ordem?: number
        }
        Update: {
          cargo_id?: string
          criado_em?: string
          ferramenta_id?: string
          obrigatoria?: boolean
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "cargo_ferramentas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargo_ferramentas_ferramenta_id_fkey"
            columns: ["ferramenta_id"]
            isOneToOne: false
            referencedRelation: "ferramentas_dinamicas"
            referencedColumns: ["id"]
          },
        ]
      }
      cargo_tarefas: {
        Row: {
          ativo: boolean
          cargo_id: string
          criado_em: string
          descricao: string | null
          id: string
          ordem: number
          titulo: string
        }
        Insert: {
          ativo?: boolean
          cargo_id: string
          criado_em?: string
          descricao?: string | null
          id?: string
          ordem?: number
          titulo: string
        }
        Update: {
          ativo?: boolean
          cargo_id?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          ordem?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargo_tarefas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos: {
        Row: {
          agente_id: string | null
          ativo: boolean
          atualizado_em: string
          campos_rastreio: Json
          canal_atuacao: string
          criado_em: string
          descricao: string | null
          escopo: Database["public"]["Enums"]["escopo_ragentic"]
          id: string
          modelo_llm_padrao: string | null
          nicho_id: string | null
          nome: string
          objetivo_principal: string
          ordem: number
          regras_livres: string | null
          substitui_global_id: string | null
          tenant_id: string | null
          tipologia: Database["public"]["Enums"]["cargo_tipologia"]
        }
        Insert: {
          agente_id?: string | null
          ativo?: boolean
          atualizado_em?: string
          campos_rastreio?: Json
          canal_atuacao?: string
          criado_em?: string
          descricao?: string | null
          escopo?: Database["public"]["Enums"]["escopo_ragentic"]
          id?: string
          modelo_llm_padrao?: string | null
          nicho_id?: string | null
          nome: string
          objetivo_principal: string
          ordem?: number
          regras_livres?: string | null
          substitui_global_id?: string | null
          tenant_id?: string | null
          tipologia: Database["public"]["Enums"]["cargo_tipologia"]
        }
        Update: {
          agente_id?: string | null
          ativo?: boolean
          atualizado_em?: string
          campos_rastreio?: Json
          canal_atuacao?: string
          criado_em?: string
          descricao?: string | null
          escopo?: Database["public"]["Enums"]["escopo_ragentic"]
          id?: string
          modelo_llm_padrao?: string | null
          nicho_id?: string | null
          nome?: string
          objetivo_principal?: string
          ordem?: number
          regras_livres?: string | null
          substitui_global_id?: string | null
          tenant_id?: string | null
          tipologia?: Database["public"]["Enums"]["cargo_tipologia"]
        }
        Relationships: [
          {
            foreignKeyName: "cargos_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_substitui_global_id_fkey"
            columns: ["substitui_global_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
      carrinho_da_conversa: {
        Row: {
          adicionado_em: string
          conversa_id: string
          id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
        }
        Insert: {
          adicionado_em?: string
          conversa_id: string
          id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
        }
        Update: {
          adicionado_em?: string
          conversa_id?: string
          id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "carrinho_da_conversa_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrinho_da_conversa_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_conhecimento: {
        Row: {
          ativo: boolean | null
          ativo_default: boolean | null
          boost_pos_rerank: number | null
          cap_bytes: number
          categoria: string
          criado_em: string | null
          descricao: string | null
          exemplos_intent: Json | null
          id: string
          intents_aceitos: string[] | null
          ordem: number | null
        }
        Insert: {
          ativo?: boolean | null
          ativo_default?: boolean | null
          boost_pos_rerank?: number | null
          cap_bytes?: number
          categoria: string
          criado_em?: string | null
          descricao?: string | null
          exemplos_intent?: Json | null
          id?: string
          intents_aceitos?: string[] | null
          ordem?: number | null
        }
        Update: {
          ativo?: boolean | null
          ativo_default?: boolean | null
          boost_pos_rerank?: number | null
          cap_bytes?: number
          categoria?: string
          criado_em?: string | null
          descricao?: string | null
          exemplos_intent?: Json | null
          id?: string
          intents_aceitos?: string[] | null
          ordem?: number | null
        }
        Relationships: []
      }
      categorias_financeiras: {
        Row: {
          atualizado_em: string
          categoria_pai_id: string | null
          criado_em: string
          deleted_at: string | null
          id: string
          nome: string
          tenant_id: string
        }
        Insert: {
          atualizado_em?: string
          categoria_pai_id?: string | null
          criado_em?: string
          deleted_at?: string | null
          id?: string
          nome: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          categoria_pai_id?: string | null
          criado_em?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_categoria_pai_id_fkey"
            columns: ["categoria_pai_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_produto: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          owner_id: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          owner_id: string
          slug: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          owner_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_produto_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cenarios_simulacao: {
        Row: {
          agente_id: string | null
          ativo: boolean
          criado_em: string
          criterios_sucesso: Json | null
          descricao: string | null
          id: string
          max_turnos: number | null
          modelo_lead: string | null
          modo: string
          nome: string
          owner_id: string
          persona_lead: Json | null
          turnos_scripted: Json | null
        }
        Insert: {
          agente_id?: string | null
          ativo?: boolean
          criado_em?: string
          criterios_sucesso?: Json | null
          descricao?: string | null
          id?: string
          max_turnos?: number | null
          modelo_lead?: string | null
          modo: string
          nome: string
          owner_id: string
          persona_lead?: Json | null
          turnos_scripted?: Json | null
        }
        Update: {
          agente_id?: string | null
          ativo?: boolean
          criado_em?: string
          criterios_sucesso?: Json | null
          descricao?: string | null
          id?: string
          max_turnos?: number | null
          modelo_lead?: string | null
          modo?: string
          nome?: string
          owner_id?: string
          persona_lead?: Json | null
          turnos_scripted?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cenarios_simulacao_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cenarios_simulacao_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cenarios_simulacao_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          agente_id: string | null
          atualizado_em: string
          criado_em: string
          dados: Json
          deleted_at: string | null
          email: string | null
          fonte: string | null
          id: string
          nome: string
          owner_id: string
          tags: string[] | null
          telefone: string | null
        }
        Insert: {
          agente_id?: string | null
          atualizado_em?: string
          criado_em?: string
          dados?: Json
          deleted_at?: string | null
          email?: string | null
          fonte?: string | null
          id?: string
          nome?: string
          owner_id: string
          tags?: string[] | null
          telefone?: string | null
        }
        Update: {
          agente_id?: string | null
          atualizado_em?: string
          criado_em?: string
          dados?: Json
          deleted_at?: string | null
          email?: string | null
          fonte?: string | null
          id?: string
          nome?: string
          owner_id?: string
          tags?: string[] | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cofre_pii_lead: {
        Row: {
          cnpj_masked: string | null
          cnpj_real: string | null
          cpf_masked: string | null
          cpf_real: string | null
          created_at: string
          lead_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cnpj_masked?: string | null
          cnpj_real?: string | null
          cpf_masked?: string | null
          cpf_real?: string | null
          created_at?: string
          lead_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cnpj_masked?: string | null
          cnpj_real?: string | null
          cpf_masked?: string | null
          cpf_real?: string | null
          created_at?: string
          lead_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_cofre_pii_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_cofre_pii_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_indicacao_campanha: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          lead_id: string
          tenant_id: string
          valor_comissao: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          lead_id: string
          tenant_id: string
          valor_comissao: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          tenant_id?: string
          valor_comissao?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_indicacao_comissoes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_indicacao_comissoes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_gargalos_campanha_tenant"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_indicacao_comissoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_indicacao_comissoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comparativo_nicho: {
        Row: {
          calculado_em: string
          count_tenants: number
          epsilon: number
          expira_em: string
          id: string
          janela_dias: number
          metrica: string
          nicho_id: string
          valor_anonimizado: Json
        }
        Insert: {
          calculado_em?: string
          count_tenants: number
          epsilon?: number
          expira_em?: string
          id?: string
          janela_dias?: number
          metrica: string
          nicho_id: string
          valor_anonimizado: Json
        }
        Update: {
          calculado_em?: string
          count_tenants?: number
          epsilon?: number
          expira_em?: string
          id?: string
          janela_dias?: number
          metrica?: string
          nicho_id?: string
          valor_anonimizado?: Json
        }
        Relationships: [
          {
            foreignKeyName: "comparativo_nicho_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      compromissos: {
        Row: {
          confirmacao_lead_em: string | null
          conversation_id: string
          created_at: string
          criado_por: string | null
          cumprido_em: string | null
          descricao: string
          duracao_min: number | null
          id: string
          lead_id: string | null
          lembretes_config: Json | null
          link_call: string | null
          local_presencial: string | null
          origem: string
          origem_turno: number | null
          pessoa_responsavel_id: string | null
          scheduled_action_id: string | null
          scheduled_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confirmacao_lead_em?: string | null
          conversation_id: string
          created_at?: string
          criado_por?: string | null
          cumprido_em?: string | null
          descricao: string
          duracao_min?: number | null
          id?: string
          lead_id?: string | null
          lembretes_config?: Json | null
          link_call?: string | null
          local_presencial?: string | null
          origem?: string
          origem_turno?: number | null
          pessoa_responsavel_id?: string | null
          scheduled_action_id?: string | null
          scheduled_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confirmacao_lead_em?: string | null
          conversation_id?: string
          created_at?: string
          criado_por?: string | null
          cumprido_em?: string | null
          descricao?: string
          duracao_min?: number | null
          id?: string
          lead_id?: string | null
          lembretes_config?: Json | null
          link_call?: string | null
          local_presencial?: string | null
          origem?: string
          origem_turno?: number | null
          pessoa_responsavel_id?: string | null
          scheduled_action_id?: string | null
          scheduled_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compromissos_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_pessoa_responsavel_id_fkey"
            columns: ["pessoa_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_scheduled_action_id_fkey"
            columns: ["scheduled_action_id"]
            isOneToOne: false
            referencedRelation: "acoes_agendadas"
            referencedColumns: ["id"]
          },
        ]
      }
      compromissos_do_lead: {
        Row: {
          carga: Json | null
          cliente_id: string | null
          conversa_id: string | null
          criado_em: string
          id: string
          quando: string
          status: string
          titulo: string
        }
        Insert: {
          carga?: Json | null
          cliente_id?: string | null
          conversa_id?: string | null
          criado_em?: string
          id?: string
          quando: string
          status?: string
          titulo: string
        }
        Update: {
          carga?: Json | null
          cliente_id?: string | null
          conversa_id?: string | null
          criado_em?: string
          id?: string
          quando?: string
          status?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compromissos_do_lead_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_do_lead_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      conexoes_google: {
        Row: {
          atualizado_em: string
          calendario_babel_id: string | null
          conectado_em: string
          deleted_at: string | null
          escopos: string | null
          google_email: string | null
          refresh_token: string
          tenant_id: string
        }
        Insert: {
          atualizado_em?: string
          calendario_babel_id?: string | null
          conectado_em?: string
          deleted_at?: string | null
          escopos?: string | null
          google_email?: string | null
          refresh_token: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          calendario_babel_id?: string | null
          conectado_em?: string
          deleted_at?: string | null
          escopos?: string | null
          google_email?: string | null
          refresh_token?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conexoes_google_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config_chamadas_llm: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          criado_em: string
          custo_teto_diario: number | null
          deleted_at: string | null
          descricao: string | null
          escopo: string
          gavetas_ativas: Json
          itens_produzidos: string[]
          json_mode: boolean
          max_tokens: number
          modelo: string
          nicho_id: string | null
          nome: string
          notas: string | null
          posicao: string
          prompt_template: string
          schedule: string | null
          temperatura: number
          tenant_id: string | null
          versao: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          criado_em?: string
          custo_teto_diario?: number | null
          deleted_at?: string | null
          descricao?: string | null
          escopo?: string
          gavetas_ativas?: Json
          itens_produzidos?: string[]
          json_mode?: boolean
          max_tokens?: number
          modelo: string
          nicho_id?: string | null
          nome: string
          notas?: string | null
          posicao?: string
          prompt_template?: string
          schedule?: string | null
          temperatura?: number
          tenant_id?: string | null
          versao?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          criado_em?: string
          custo_teto_diario?: number | null
          deleted_at?: string | null
          descricao?: string | null
          escopo?: string
          gavetas_ativas?: Json
          itens_produzidos?: string[]
          json_mode?: boolean
          max_tokens?: number
          modelo?: string
          nicho_id?: string | null
          nome?: string
          notas?: string | null
          posicao?: string
          prompt_template?: string
          schedule?: string | null
          temperatura?: number
          tenant_id?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "config_chamadas_llm_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "config_chamadas_llm_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "config_chamadas_llm_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config_contrato: {
        Row: {
          campos_obrigatorios_padrao: string[]
          cor_pagina: string | null
          created_at: string | null
          descricao_empresa: string | null
          id: string
          instrucao_selfie_padrao: string | null
          logo_url: string | null
          nome_empresa: string | null
          num_testemunhas_padrao: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          campos_obrigatorios_padrao?: string[]
          cor_pagina?: string | null
          created_at?: string | null
          descricao_empresa?: string | null
          id?: string
          instrucao_selfie_padrao?: string | null
          logo_url?: string | null
          nome_empresa?: string | null
          num_testemunhas_padrao?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          campos_obrigatorios_padrao?: string[]
          cor_pagina?: string | null
          created_at?: string | null
          descricao_empresa?: string | null
          id?: string
          instrucao_selfie_padrao?: string | null
          logo_url?: string | null
          nome_empresa?: string | null
          num_testemunhas_padrao?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_contrato_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config_curadoria_tag: {
        Row: {
          id: number
          intervalo_horas: number
          last_run_at: string | null
          next_run_at: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          intervalo_horas?: number
          last_run_at?: string | null
          next_run_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          intervalo_horas?: number
          last_run_at?: string | null
          next_run_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      config_plataforma: {
        Row: {
          cnpj: string | null
          created_at: string | null
          description: string | null
          domain: string | null
          id: string
          logo_url: string | null
          pix_key: string | null
          primary_color: string | null
          retencao_prompts_turno_dias: number
          reuniao_aviso_ativo: boolean
          reuniao_aviso_limiar: number
          reuniao_limite_participantes: number
          saque_dia_semana: number | null
          saque_hora_fim: string | null
          saque_hora_inicio: string | null
          saque_regras_ativo: boolean | null
          saque_valor_minimo: number | null
          support_email: string | null
          system_name: string
          termos_uso: string | null
          termos_uso_ativo: boolean | null
          updated_at: string | null
          usd_brl_atualizado_em: string | null
          usd_brl_cotacao: number
        }
        Insert: {
          cnpj?: string | null
          created_at?: string | null
          description?: string | null
          domain?: string | null
          id?: string
          logo_url?: string | null
          pix_key?: string | null
          primary_color?: string | null
          retencao_prompts_turno_dias?: number
          reuniao_aviso_ativo?: boolean
          reuniao_aviso_limiar?: number
          reuniao_limite_participantes?: number
          saque_dia_semana?: number | null
          saque_hora_fim?: string | null
          saque_hora_inicio?: string | null
          saque_regras_ativo?: boolean | null
          saque_valor_minimo?: number | null
          support_email?: string | null
          system_name?: string
          termos_uso?: string | null
          termos_uso_ativo?: boolean | null
          updated_at?: string | null
          usd_brl_atualizado_em?: string | null
          usd_brl_cotacao?: number
        }
        Update: {
          cnpj?: string | null
          created_at?: string | null
          description?: string | null
          domain?: string | null
          id?: string
          logo_url?: string | null
          pix_key?: string | null
          primary_color?: string | null
          retencao_prompts_turno_dias?: number
          reuniao_aviso_ativo?: boolean
          reuniao_aviso_limiar?: number
          reuniao_limite_participantes?: number
          saque_dia_semana?: number | null
          saque_hora_fim?: string | null
          saque_hora_inicio?: string | null
          saque_regras_ativo?: boolean | null
          saque_valor_minimo?: number | null
          support_email?: string | null
          system_name?: string
          termos_uso?: string | null
          termos_uso_ativo?: boolean | null
          updated_at?: string | null
          usd_brl_atualizado_em?: string | null
          usd_brl_cotacao?: number
        }
        Relationships: []
      }
      config_prompt: {
        Row: {
          content: string
          description: string | null
          key: string
          updated_at: string
        }
        Insert: {
          content?: string
          description?: string | null
          key: string
          updated_at?: string
        }
        Update: {
          content?: string
          description?: string | null
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      config_suporte: {
        Row: {
          avatar_url: string | null
          away_message: string | null
          greeting_message: string | null
          id: string
          is_online: boolean | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          away_message?: string | null
          greeting_message?: string | null
          id?: string
          is_online?: boolean | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          away_message?: string | null
          greeting_message?: string | null
          id?: string
          is_online?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      configuracoes_sistema: {
        Row: {
          atualizado_em: string
          chave: string
          valor: Json
        }
        Insert: {
          atualizado_em?: string
          chave: string
          valor?: Json
        }
        Update: {
          atualizado_em?: string
          chave?: string
          valor?: Json
        }
        Relationships: []
      }
      confirmacoes_exclusao: {
        Row: {
          comando: string
          conversa_id: string
          criado_em: string
          id: string
          linhas_previstas: number
          owner_id: string
          resumo: Json | null
          tabela: string
          usado_em: string | null
        }
        Insert: {
          comando: string
          conversa_id: string
          criado_em?: string
          id?: string
          linhas_previstas: number
          owner_id: string
          resumo?: Json | null
          tabela: string
          usado_em?: string | null
        }
        Update: {
          comando?: string
          conversa_id?: string
          criado_em?: string
          id?: string
          linhas_previstas?: number
          owner_id?: string
          resumo?: Json | null
          tabela?: string
          usado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "confirmacoes_exclusao_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "mentor_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas: {
        Row: {
          agente_id: string | null
          aviso_final: string | null
          banner_url: string | null
          campos_obrigatorios: Json
          chave_pix: string | null
          chave_publica: string
          comprovante_analise: Json | null
          consultada_em: string | null
          conversa_id: string | null
          cor_pagina: string | null
          created_at: string
          custo: number | null
          dados_cliente: Json
          deleted_at: string | null
          descricao_empresa: string | null
          documento: string | null
          erro_motivo: string | null
          id: string
          instrucao_selfie: string | null
          lead_id: string | null
          logo_url: string | null
          nome_empresa: string | null
          origem: string
          params_api: Json
          pdf_url: string | null
          preco: number | null
          produto_oferta_id: string | null
          resultado: Json | null
          resultado_path: string | null
          status: string
          tenant_id: string
          tipo_doc: string | null
          tipo_id: string | null
          titulo: string | null
          url_comprovante_pagamento: string | null
          url_documento: string | null
          url_selfie: string | null
          validacao_comprovante: Json
        }
        Insert: {
          agente_id?: string | null
          aviso_final?: string | null
          banner_url?: string | null
          campos_obrigatorios?: Json
          chave_pix?: string | null
          chave_publica?: string
          comprovante_analise?: Json | null
          consultada_em?: string | null
          conversa_id?: string | null
          cor_pagina?: string | null
          created_at?: string
          custo?: number | null
          dados_cliente?: Json
          deleted_at?: string | null
          descricao_empresa?: string | null
          documento?: string | null
          erro_motivo?: string | null
          id?: string
          instrucao_selfie?: string | null
          lead_id?: string | null
          logo_url?: string | null
          nome_empresa?: string | null
          origem?: string
          params_api?: Json
          pdf_url?: string | null
          preco?: number | null
          produto_oferta_id?: string | null
          resultado?: Json | null
          resultado_path?: string | null
          status?: string
          tenant_id: string
          tipo_doc?: string | null
          tipo_id?: string | null
          titulo?: string | null
          url_comprovante_pagamento?: string | null
          url_documento?: string | null
          url_selfie?: string | null
          validacao_comprovante?: Json
        }
        Update: {
          agente_id?: string | null
          aviso_final?: string | null
          banner_url?: string | null
          campos_obrigatorios?: Json
          chave_pix?: string | null
          chave_publica?: string
          comprovante_analise?: Json | null
          consultada_em?: string | null
          conversa_id?: string | null
          cor_pagina?: string | null
          created_at?: string
          custo?: number | null
          dados_cliente?: Json
          deleted_at?: string | null
          descricao_empresa?: string | null
          documento?: string | null
          erro_motivo?: string | null
          id?: string
          instrucao_selfie?: string | null
          lead_id?: string | null
          logo_url?: string | null
          nome_empresa?: string | null
          origem?: string
          params_api?: Json
          pdf_url?: string | null
          preco?: number | null
          produto_oferta_id?: string | null
          resultado?: Json | null
          resultado_path?: string | null
          status?: string
          tenant_id?: string
          tipo_doc?: string | null
          tipo_id?: string | null
          titulo?: string | null
          url_comprovante_pagamento?: string | null
          url_documento?: string | null
          url_selfie?: string | null
          validacao_comprovante?: Json
        }
        Relationships: [
          {
            foreignKeyName: "consultas_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_produto_oferta_id_fkey"
            columns: ["produto_oferta_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "consultas_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_carteira_mov: {
        Row: {
          consulta_id: string | null
          created_at: string
          id: string
          recarga_id: string | null
          saldo_apos: number
          tenant_id: string
          tipo: string
          valor: number
        }
        Insert: {
          consulta_id?: string | null
          created_at?: string
          id?: string
          recarga_id?: string | null
          saldo_apos: number
          tenant_id: string
          tipo: string
          valor: number
        }
        Update: {
          consulta_id?: string | null
          created_at?: string
          id?: string
          recarga_id?: string | null
          saldo_apos?: number
          tenant_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultas_carteira_mov_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_carteira_mov_recarga_id_fkey"
            columns: ["recarga_id"]
            isOneToOne: false
            referencedRelation: "consultas_recargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_carteira_mov_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_config_api: {
        Row: {
          ativo: boolean
          atualizado_em: string
          id: string
          provedor: string
          secret_nome: string | null
          url_base: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          id?: string
          provedor: string
          secret_nome?: string | null
          url_base: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          id?: string
          provedor?: string
          secret_nome?: string | null
          url_base?: string
        }
        Relationships: []
      }
      consultas_config_tenant: {
        Row: {
          agente_pode_vender: boolean
          aviso_final: string | null
          banner_url: string | null
          campos_formulario: Json
          chave_pix: string | null
          created_at: string
          doc_foto_ativo: boolean
          id: string
          logo_url: string | null
          preco_venda_cnpj: number | null
          preco_venda_cpf: number | null
          preco_venda_padrao: number | null
          produto_oferta_id: string | null
          selfie_ativo: boolean
          tenant_id: string
          tipo_padrao_id: string | null
          updated_at: string
          validacao_comprovante: Json
        }
        Insert: {
          agente_pode_vender?: boolean
          aviso_final?: string | null
          banner_url?: string | null
          campos_formulario?: Json
          chave_pix?: string | null
          created_at?: string
          doc_foto_ativo?: boolean
          id?: string
          logo_url?: string | null
          preco_venda_cnpj?: number | null
          preco_venda_cpf?: number | null
          preco_venda_padrao?: number | null
          produto_oferta_id?: string | null
          selfie_ativo?: boolean
          tenant_id: string
          tipo_padrao_id?: string | null
          updated_at?: string
          validacao_comprovante?: Json
        }
        Update: {
          agente_pode_vender?: boolean
          aviso_final?: string | null
          banner_url?: string | null
          campos_formulario?: Json
          chave_pix?: string | null
          created_at?: string
          doc_foto_ativo?: boolean
          id?: string
          logo_url?: string | null
          preco_venda_cnpj?: number | null
          preco_venda_cpf?: number | null
          preco_venda_padrao?: number | null
          produto_oferta_id?: string | null
          selfie_ativo?: boolean
          tenant_id?: string
          tipo_padrao_id?: string | null
          updated_at?: string
          validacao_comprovante?: Json
        }
        Relationships: [
          {
            foreignKeyName: "consultas_config_tenant_produto_oferta_id_fkey"
            columns: ["produto_oferta_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_config_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_config_tenant_tipo_padrao_id_fkey"
            columns: ["tipo_padrao_id"]
            isOneToOne: false
            referencedRelation: "consultas_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_pacotes: {
        Row: {
          ativo: boolean
          created_at: string
          credito: number
          deleted_at: string | null
          id: string
          nome: string
          ordem: number
          valor: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          credito: number
          deleted_at?: string | null
          id?: string
          nome: string
          ordem?: number
          valor: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          credito?: number
          deleted_at?: string | null
          id?: string
          nome?: string
          ordem?: number
          valor?: number
        }
        Relationships: []
      }
      consultas_recargas: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          chave_pix: string | null
          created_at: string
          credito: number
          id: string
          pacote_id: string | null
          status: string
          tenant_id: string
          url_comprovante: string | null
          valor: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          chave_pix?: string | null
          created_at?: string
          credito: number
          id?: string
          pacote_id?: string | null
          status?: string
          tenant_id: string
          url_comprovante?: string | null
          valor: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          chave_pix?: string | null
          created_at?: string
          credito?: number
          id?: string
          pacote_id?: string | null
          status?: string
          tenant_id?: string
          url_comprovante?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultas_recargas_pacote_id_fkey"
            columns: ["pacote_id"]
            isOneToOne: false
            referencedRelation: "consultas_pacotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_recargas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_saldo: {
        Row: {
          atualizado_em: string
          saldo: number
          tenant_id: string
        }
        Insert: {
          atualizado_em?: string
          saldo?: number
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          saldo?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultas_saldo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_tipos: {
        Row: {
          ativo: boolean
          categoria: string
          codigo_api: string
          created_at: string
          custo: number
          deleted_at: string | null
          descricao: string | null
          id: string
          nome: string
          ordem: number
          sale_api: number | null
          settings_api: Json
          tipo_doc: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          codigo_api: string
          created_at?: string
          custo: number
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          sale_api?: number | null
          settings_api?: Json
          tipo_doc?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo_api?: string
          created_at?: string
          custo?: number
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          sale_api?: number | null
          settings_api?: Json
          tipo_doc?: string
        }
        Relationships: []
      }
      contas_a_pagar: {
        Row: {
          atualizado_em: string
          criado_em: string
          deleted_at: string | null
          id: string
          parcelas_pagas: number
          parcelas_total: number
          persistencia: string
          proximo_vencimento: string | null
          status: string
          tenant_id: string
          titulo: string
          ultimo_lembrete_em: string | null
          valor_total: number
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          deleted_at?: string | null
          id?: string
          parcelas_pagas?: number
          parcelas_total?: number
          persistencia?: string
          proximo_vencimento?: string | null
          status?: string
          tenant_id: string
          titulo: string
          ultimo_lembrete_em?: string | null
          valor_total: number
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          deleted_at?: string | null
          id?: string
          parcelas_pagas?: number
          parcelas_total?: number
          persistencia?: string
          proximo_vencimento?: string | null
          status?: string
          tenant_id?: string
          titulo?: string
          ultimo_lembrete_em?: string | null
          valor_total?: number
        }
        Relationships: []
      }
      contas_a_receber: {
        Row: {
          atualizado_em: string
          contrato_id: string | null
          criado_em: string
          deleted_at: string | null
          descricao: string
          id: string
          lead_id: string | null
          movimento_id: string | null
          numero_parcela: number
          origem: string
          recebida_em: string | null
          status: string
          tenant_id: string
          valor: number
          vencimento: string
        }
        Insert: {
          atualizado_em?: string
          contrato_id?: string | null
          criado_em?: string
          deleted_at?: string | null
          descricao: string
          id?: string
          lead_id?: string | null
          movimento_id?: string | null
          numero_parcela?: number
          origem?: string
          recebida_em?: string | null
          status?: string
          tenant_id: string
          valor: number
          vencimento: string
        }
        Update: {
          atualizado_em?: string
          contrato_id?: string | null
          criado_em?: string
          deleted_at?: string | null
          descricao?: string
          id?: string
          lead_id?: string | null
          movimento_id?: string | null
          numero_parcela?: number
          origem?: string
          recebida_em?: string | null
          status?: string
          tenant_id?: string
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_a_receber_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_receber_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_legacy_en"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_receber_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_receber_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "movimentos_financeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_receber_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_itens: {
        Row: {
          contrato_id: string
          criado_em: string
          id: string
          nome_snapshot: string
          ordem: number
          preco_unitario: number
          produto_id: string | null
          quantidade: number
          subtotal: number
        }
        Insert: {
          contrato_id: string
          criado_em?: string
          id?: string
          nome_snapshot: string
          ordem?: number
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          subtotal?: number
        }
        Update: {
          contrato_id?: string
          criado_em?: string
          id?: string
          nome_snapshot?: string
          ordem?: number
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_itens_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_itens_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_legacy_en"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          agente_id: string | null
          assinado_em: string | null
          campos_cliente: string[] | null
          campos_formulario: Json | null
          campos_obrigatorios: Json | null
          chave_pix: string | null
          chave_publica: string
          conversa_id: string | null
          cor_pagina: string | null
          created_at: string | null
          dados_cliente: Json | null
          dados_pagamento: Json | null
          dados_signatario: Json | null
          dados_testemunha: Json | null
          descricao_empresa: string | null
          detalhes_pagamento: Json | null
          exigencias: Json | null
          forma_pagamento_escolhida: Json | null
          hash_contrato: string | null
          id: string
          instrucao_selfie: string | null
          ip_assinatura: string | null
          ip_testemunha: string | null
          lead_id: string | null
          link_entregue_em: string | null
          link_parcelamento: string | null
          logo_url: string | null
          metodo_pagamento: string | null
          molde_versao: string | null
          nome_empresa: string | null
          nome_template: string | null
          num_testemunhas: number
          opcoes_pagamento: Json | null
          origem: string
          pdf_url: string | null
          posicao_pagamento: string | null
          status: string | null
          tenant_id: string | null
          testemunha_assinada_em: string | null
          texto_contrato: string | null
          titulo: string | null
          url_assinatura: string | null
          url_assinatura_testemunha: string | null
          url_comprovante_pagamento: string | null
          url_documento: string | null
          url_documento_testemunha: string | null
          url_selfie: string | null
          url_selfie_testemunha: string | null
        }
        Insert: {
          agente_id?: string | null
          assinado_em?: string | null
          campos_cliente?: string[] | null
          campos_formulario?: Json | null
          campos_obrigatorios?: Json | null
          chave_pix?: string | null
          chave_publica?: string
          conversa_id?: string | null
          cor_pagina?: string | null
          created_at?: string | null
          dados_cliente?: Json | null
          dados_pagamento?: Json | null
          dados_signatario?: Json | null
          dados_testemunha?: Json | null
          descricao_empresa?: string | null
          detalhes_pagamento?: Json | null
          exigencias?: Json | null
          forma_pagamento_escolhida?: Json | null
          hash_contrato?: string | null
          id?: string
          instrucao_selfie?: string | null
          ip_assinatura?: string | null
          ip_testemunha?: string | null
          lead_id?: string | null
          link_entregue_em?: string | null
          link_parcelamento?: string | null
          logo_url?: string | null
          metodo_pagamento?: string | null
          molde_versao?: string | null
          nome_empresa?: string | null
          nome_template?: string | null
          num_testemunhas?: number
          opcoes_pagamento?: Json | null
          origem?: string
          pdf_url?: string | null
          posicao_pagamento?: string | null
          status?: string | null
          tenant_id?: string | null
          testemunha_assinada_em?: string | null
          texto_contrato?: string | null
          titulo?: string | null
          url_assinatura?: string | null
          url_assinatura_testemunha?: string | null
          url_comprovante_pagamento?: string | null
          url_documento?: string | null
          url_documento_testemunha?: string | null
          url_selfie?: string | null
          url_selfie_testemunha?: string | null
        }
        Update: {
          agente_id?: string | null
          assinado_em?: string | null
          campos_cliente?: string[] | null
          campos_formulario?: Json | null
          campos_obrigatorios?: Json | null
          chave_pix?: string | null
          chave_publica?: string
          conversa_id?: string | null
          cor_pagina?: string | null
          created_at?: string | null
          dados_cliente?: Json | null
          dados_pagamento?: Json | null
          dados_signatario?: Json | null
          dados_testemunha?: Json | null
          descricao_empresa?: string | null
          detalhes_pagamento?: Json | null
          exigencias?: Json | null
          forma_pagamento_escolhida?: Json | null
          hash_contrato?: string | null
          id?: string
          instrucao_selfie?: string | null
          ip_assinatura?: string | null
          ip_testemunha?: string | null
          lead_id?: string | null
          link_entregue_em?: string | null
          link_parcelamento?: string | null
          logo_url?: string | null
          metodo_pagamento?: string | null
          molde_versao?: string | null
          nome_empresa?: string | null
          nome_template?: string | null
          num_testemunhas?: number
          opcoes_pagamento?: Json | null
          origem?: string
          pdf_url?: string | null
          posicao_pagamento?: string | null
          status?: string | null
          tenant_id?: string | null
          testemunha_assinada_em?: string | null
          texto_contrato?: string | null
          titulo?: string | null
          url_assinatura?: string | null
          url_assinatura_testemunha?: string | null
          url_comprovante_pagamento?: string | null
          url_documento?: string | null
          url_documento_testemunha?: string | null
          url_selfie?: string | null
          url_selfie_testemunha?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_template: {
        Row: {
          ativo: boolean
          blocos: Json
          campos_cliente: Json
          campos_obrigatorios: string[]
          chave_pix: string | null
          clausulas_por_produto: Json
          conteudo: string | null
          conteudo_comum: string | null
          created_at: string
          id: string
          instrucao_selfie: string | null
          jornada_ordem: string[]
          link_parcelamento: string | null
          nome: string
          num_testemunhas: number
          opcoes_parcelamento: Json
          pagamento: Json
          placeholders: Json
          posicao_pagamento: string | null
          produto_id: string | null
          produtos_aceitos: Json
          provas: Json
          updated_at: string
          user_id: string
          valor_a_vista: number | null
        }
        Insert: {
          ativo?: boolean
          blocos?: Json
          campos_cliente?: Json
          campos_obrigatorios?: string[]
          chave_pix?: string | null
          clausulas_por_produto?: Json
          conteudo?: string | null
          conteudo_comum?: string | null
          created_at?: string
          id?: string
          instrucao_selfie?: string | null
          jornada_ordem?: string[]
          link_parcelamento?: string | null
          nome?: string
          num_testemunhas?: number
          opcoes_parcelamento?: Json
          pagamento?: Json
          placeholders?: Json
          posicao_pagamento?: string | null
          produto_id?: string | null
          produtos_aceitos?: Json
          provas?: Json
          updated_at?: string
          user_id: string
          valor_a_vista?: number | null
        }
        Update: {
          ativo?: boolean
          blocos?: Json
          campos_cliente?: Json
          campos_obrigatorios?: string[]
          chave_pix?: string | null
          clausulas_por_produto?: Json
          conteudo?: string | null
          conteudo_comum?: string | null
          created_at?: string
          id?: string
          instrucao_selfie?: string | null
          jornada_ordem?: string[]
          link_parcelamento?: string | null
          nome?: string
          num_testemunhas?: number
          opcoes_parcelamento?: Json
          pagamento?: Json
          placeholders?: Json
          posicao_pagamento?: string | null
          produto_id?: string | null
          produtos_aceitos?: Json
          provas?: Json
          updated_at?: string
          user_id?: string
          valor_a_vista?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_template_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_template_backup_chave_dupla_2026_05_16: {
        Row: {
          campos_obrigatorios: string[] | null
          conteudo: string | null
          id: string | null
          id_pk: number
          nome: string | null
          snapshot_em: string | null
          user_id: string | null
        }
        Insert: {
          campos_obrigatorios?: string[] | null
          conteudo?: string | null
          id?: string | null
          id_pk?: never
          nome?: string | null
          snapshot_em?: string | null
          user_id?: string | null
        }
        Update: {
          campos_obrigatorios?: string[] | null
          conteudo?: string | null
          id?: string | null
          id_pk?: never
          nome?: string | null
          snapshot_em?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      conversas: {
        Row: {
          agent_enabled: boolean | null
          agente_id: string | null
          atualizado_em: string
          cargo_ativo_id: string | null
          channel: string | null
          created_at: string | null
          despedida_sem_data_at: string | null
          encerrada_em: string | null
          id: string
          lead_id: string | null
          memoria_pendente: boolean
          memoria_pendente_desde: string | null
          phone: string | null
          responsavel_id: string | null
          score_lead: number | null
          status: string | null
          tenant_id: string | null
          titulo: string | null
          updated_at: string | null
          visto_em: string | null
        }
        Insert: {
          agent_enabled?: boolean | null
          agente_id?: string | null
          atualizado_em?: string
          cargo_ativo_id?: string | null
          channel?: string | null
          created_at?: string | null
          despedida_sem_data_at?: string | null
          encerrada_em?: string | null
          id?: string
          lead_id?: string | null
          memoria_pendente?: boolean
          memoria_pendente_desde?: string | null
          phone?: string | null
          responsavel_id?: string | null
          score_lead?: number | null
          status?: string | null
          tenant_id?: string | null
          titulo?: string | null
          updated_at?: string | null
          visto_em?: string | null
        }
        Update: {
          agent_enabled?: boolean | null
          agente_id?: string | null
          atualizado_em?: string
          cargo_ativo_id?: string | null
          channel?: string | null
          created_at?: string | null
          despedida_sem_data_at?: string | null
          encerrada_em?: string | null
          id?: string
          lead_id?: string | null
          memoria_pendente?: boolean
          memoria_pendente_desde?: string | null
          phone?: string | null
          responsavel_id?: string | null
          score_lead?: number | null
          status?: string | null
          tenant_id?: string | null
          titulo?: string | null
          updated_at?: string | null
          visto_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_cargo_ativo_id_fkey"
            columns: ["cargo_ativo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      convites: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          invited_by: string | null
          role_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          id?: string
          invited_by?: string | null
          role_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          role_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custos_llm_dia: {
        Row: {
          atualizado_em: string
          created_at: string
          custo_byok_usd: number
          custo_usd: number
          dia: string
          endpoint_id: string
          id: string
          modelo: string
          modelo_permaslug: string
          provedor: string
          requisicoes: number
          tokens_entrada: number
          tokens_raciocinio: number
          tokens_saida: number
        }
        Insert: {
          atualizado_em?: string
          created_at?: string
          custo_byok_usd?: number
          custo_usd?: number
          dia: string
          endpoint_id?: string
          id?: string
          modelo?: string
          modelo_permaslug?: string
          provedor?: string
          requisicoes?: number
          tokens_entrada?: number
          tokens_raciocinio?: number
          tokens_saida?: number
        }
        Update: {
          atualizado_em?: string
          created_at?: string
          custo_byok_usd?: number
          custo_usd?: number
          dia?: string
          endpoint_id?: string
          id?: string
          modelo?: string
          modelo_permaslug?: string
          provedor?: string
          requisicoes?: number
          tokens_entrada?: number
          tokens_raciocinio?: number
          tokens_saida?: number
        }
        Relationships: []
      }
      debug_webhook: {
        Row: {
          carga: Json
          created_at: string | null
          id: number
        }
        Insert: {
          carga: Json
          created_at?: string | null
          id?: number
        }
        Update: {
          carga?: Json
          created_at?: string | null
          id?: number
        }
        Relationships: []
      }
      dedup_webhook: {
        Row: {
          message_hash: string
          received_at: string | null
          zapi_message_id: string | null
        }
        Insert: {
          message_hash: string
          received_at?: string | null
          zapi_message_id?: string | null
        }
        Update: {
          message_hash?: string
          received_at?: string | null
          zapi_message_id?: string | null
        }
        Relationships: []
      }
      depoimentos_publicos: {
        Row: {
          aprovado: boolean
          aprovado_at: string | null
          autor_foto_url: string | null
          autor_nome: string
          created_at: string
          id: string
          nota: number | null
          rag_bloco_id: string | null
          texto: string
          user_id: string
        }
        Insert: {
          aprovado?: boolean
          aprovado_at?: string | null
          autor_foto_url?: string | null
          autor_nome: string
          created_at?: string
          id?: string
          nota?: number | null
          rag_bloco_id?: string | null
          texto: string
          user_id: string
        }
        Update: {
          aprovado?: boolean
          aprovado_at?: string | null
          autor_foto_url?: string | null
          autor_nome?: string
          created_at?: string
          id?: string
          nota?: number | null
          rag_bloco_id?: string | null
          texto?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_testimonials_rag_chunk_id_fkey"
            columns: ["rag_bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_conhecimento"
            referencedColumns: ["id"]
          },
        ]
      }
      dicas_dono: {
        Row: {
          consumida_no_turno: number | null
          conversation_id: string | null
          criado_em: string
          criado_por: string | null
          id: string
          lead_id: string
          tenant_id: string
          texto: string
        }
        Insert: {
          consumida_no_turno?: number | null
          conversation_id?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          lead_id: string
          tenant_id: string
          texto: string
        }
        Update: {
          consumida_no_turno?: number | null
          conversation_id?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          lead_id?: string
          tenant_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "dicas_dono_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dicas_dono_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      diretriz_bolha_blocos: {
        Row: {
          ativo: boolean
          chars_medio_sugerido: number | null
          contexto: string
          criado_em: string
          deleted_at: string | null
          embedding_status: string
          escopo: string
          id: string
          motivo: string | null
          nicho_id: string | null
          quantidade_sugerida: string
          tag_sempre_ativo: boolean
          tenant_id: string | null
          tipo_campanha: string | null
          updated_at: string | null
          vetor_semantico: unknown
        }
        Insert: {
          ativo?: boolean
          chars_medio_sugerido?: number | null
          contexto?: string
          criado_em?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          id?: string
          motivo?: string | null
          nicho_id?: string | null
          quantidade_sugerida?: string
          tag_sempre_ativo?: boolean
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string | null
          vetor_semantico?: unknown
        }
        Update: {
          ativo?: boolean
          chars_medio_sugerido?: number | null
          contexto?: string
          criado_em?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          id?: string
          motivo?: string | null
          nicho_id?: string | null
          quantidade_sugerida?: string
          tag_sempre_ativo?: boolean
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string | null
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "diretriz_bolha_blocos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_lead: {
        Row: {
          ativo: boolean
          contatos_ids: string[] | null
          created_at: string
          horario: string | null
          id: string
          lista_disparo_id: string | null
          mensagem: string | null
          midia_url: string | null
          nome: string
          tempo_descanso_segundos: number
          tenant_id: string
          tipo_conteudo: string
          ultima_execucao_dia: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          contatos_ids?: string[] | null
          created_at?: string
          horario?: string | null
          id?: string
          lista_disparo_id?: string | null
          mensagem?: string | null
          midia_url?: string | null
          nome: string
          tempo_descanso_segundos?: number
          tenant_id: string
          tipo_conteudo: string
          ultima_execucao_dia?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          contatos_ids?: string[] | null
          created_at?: string
          horario?: string | null
          id?: string
          lista_disparo_id?: string | null
          mensagem?: string | null
          midia_url?: string | null
          nome?: string
          tempo_descanso_segundos?: number
          tenant_id?: string
          tipo_conteudo?: string
          ultima_execucao_dia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_lead_lista_disparo_id_fkey"
            columns: ["lista_disparo_id"]
            isOneToOne: false
            referencedRelation: "listas_disparo_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_lead_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_lead_envios: {
        Row: {
          created_at: string
          disparo_id: string | null
          erro_detalhe: string | null
          id: string
          lead_id: string | null
          mensagem_enviada: string | null
          phone: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          disparo_id?: string | null
          erro_detalhe?: string | null
          id?: string
          lead_id?: string | null
          mensagem_enviada?: string | null
          phone?: string | null
          status: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          disparo_id?: string | null
          erro_detalhe?: string | null
          id?: string
          lead_id?: string | null
          mensagem_enviada?: string | null
          phone?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_lead_envios_disparo_id_fkey"
            columns: ["disparo_id"]
            isOneToOne: false
            referencedRelation: "disparos_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_lead_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_lead_envios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disponibilidade: {
        Row: {
          ativo: boolean
          buffer_min: number
          created_at: string
          duracao_slot_min: number
          hora_fim: string
          hora_inicio: string
          id: string
          pessoa_id: string | null
          tenant_id: string
          weekday: number
        }
        Insert: {
          ativo?: boolean
          buffer_min?: number
          created_at?: string
          duracao_slot_min?: number
          hora_fim: string
          hora_inicio: string
          id?: string
          pessoa_id?: string | null
          tenant_id: string
          weekday: number
        }
        Update: {
          ativo?: boolean
          buffer_min?: number
          created_at?: string
          duracao_slot_min?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          pessoa_id?: string | null
          tenant_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidade_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidade_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_cliente: {
        Row: {
          caminho_arquivo: string
          created_at: string | null
          id: string
          lead_id: string
          nome_arquivo: string
          rotulo: string
          tamanho_arquivo: string
          tenant_id: string
          tipo_arquivo: string
          updated_at: string | null
        }
        Insert: {
          caminho_arquivo: string
          created_at?: string | null
          id?: string
          lead_id: string
          nome_arquivo: string
          rotulo: string
          tamanho_arquivo?: string
          tenant_id: string
          tipo_arquivo?: string
          updated_at?: string | null
        }
        Update: {
          caminho_arquivo?: string
          created_at?: string | null
          id?: string
          lead_id?: string
          nome_arquivo?: string
          rotulo?: string
          tamanho_arquivo?: string
          tenant_id?: string
          tipo_arquivo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_cliente_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_financeiros: {
        Row: {
          criado_em: string
          dados_extraidos: Json
          deleted_at: string | null
          hash_arquivo: string | null
          id: string
          storage_path: string | null
          tenant_id: string
          tipo: string
        }
        Insert: {
          criado_em?: string
          dados_extraidos?: Json
          deleted_at?: string | null
          hash_arquivo?: string | null
          id?: string
          storage_path?: string | null
          tenant_id: string
          tipo?: string
        }
        Update: {
          criado_em?: string
          dados_extraidos?: Json
          deleted_at?: string | null
          hash_arquivo?: string | null
          id?: string
          storage_path?: string | null
          tenant_id?: string
          tipo?: string
        }
        Relationships: []
      }
      emocao_blocos: {
        Row: {
          ativo: boolean
          corpo: string
          criado_em: string
          deleted_at: string | null
          embedding_status: string
          emocao: string
          escopo: string
          exemplos: Json | null
          id: string
          intensidade_match: number | null
          nicho_id: string | null
          prioridade: number
          real_world_valid_from: string | null
          real_world_valid_to: string | null
          tenant_id: string | null
          tipo_campanha: string | null
          updated_at: string | null
          versao: number
          vetor_semantico: unknown
          vezes_usado: number
        }
        Insert: {
          ativo?: boolean
          corpo: string
          criado_em?: string
          deleted_at?: string | null
          embedding_status?: string
          emocao: string
          escopo: string
          exemplos?: Json | null
          id?: string
          intensidade_match?: number | null
          nicho_id?: string | null
          prioridade?: number
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string | null
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Update: {
          ativo?: boolean
          corpo?: string
          criado_em?: string
          deleted_at?: string | null
          embedding_status?: string
          emocao?: string
          escopo?: string
          exemplos?: Json | null
          id?: string
          intensidade_match?: number | null
          nicho_id?: string | null
          prioridade?: number
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          tenant_id?: string | null
          tipo_campanha?: string | null
          updated_at?: string | null
          versao?: number
          vetor_semantico?: unknown
          vezes_usado?: number
        }
        Relationships: [
          {
            foreignKeyName: "emocao_blocos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          bairro: string | null
          banner_url: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string | null
          data_inicio: string | null
          descricao: string | null
          endereco: string | null
          estado: string | null
          facebook: string | null
          horario_funcionamento: Json | null
          id: string
          instagram: string | null
          logo_url: string | null
          missao: string | null
          nome: string
          site: string | null
          tiktok: string | null
          tipo_presenca: string
          updated_at: string | null
          user_id: string
          valores: string | null
          whatsapp: string | null
          youtube: string | null
        }
        Insert: {
          bairro?: string | null
          banner_url?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string | null
          data_inicio?: string | null
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          facebook?: string | null
          horario_funcionamento?: Json | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          missao?: string | null
          nome?: string
          site?: string | null
          tiktok?: string | null
          tipo_presenca?: string
          updated_at?: string | null
          user_id: string
          valores?: string | null
          whatsapp?: string | null
          youtube?: string | null
        }
        Update: {
          bairro?: string | null
          banner_url?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string | null
          data_inicio?: string | null
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          facebook?: string | null
          horario_funcionamento?: Json | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          missao?: string | null
          nome?: string
          site?: string | null
          tiktok?: string | null
          tipo_presenca?: string
          updated_at?: string | null
          user_id?: string
          valores?: string | null
          whatsapp?: string | null
          youtube?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engajamento_lead: {
        Row: {
          comprimento_medio: number | null
          conversas_count: number
          created_at: string
          id: string
          lead_id: string
          nivel: string
          pontuacao: number
          tenant_id: string
          tendencia: string | null
          ultima_atualizacao: string
          updated_at: string
          velocidade_atual_s: number | null
          velocidade_media_s: number | null
        }
        Insert: {
          comprimento_medio?: number | null
          conversas_count?: number
          created_at?: string
          id?: string
          lead_id: string
          nivel?: string
          pontuacao?: number
          tenant_id: string
          tendencia?: string | null
          ultima_atualizacao?: string
          updated_at?: string
          velocidade_atual_s?: number | null
          velocidade_media_s?: number | null
        }
        Update: {
          comprimento_medio?: number | null
          conversas_count?: number
          created_at?: string
          id?: string
          lead_id?: string
          nivel?: string
          pontuacao?: number
          tenant_id?: string
          tendencia?: string | null
          ultima_atualizacao?: string
          updated_at?: string
          velocidade_atual_s?: number | null
          velocidade_media_s?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "engajamento_lead_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      engajamento_turnos: {
        Row: {
          comprimento_msg: number | null
          conversation_id: string
          criado_em: string
          id: string
          lead_id: string
          tenant_id: string
          tom_detectado: string | null
          turno: number
          velocidade_resposta_s: number | null
        }
        Insert: {
          comprimento_msg?: number | null
          conversation_id: string
          criado_em?: string
          id?: string
          lead_id: string
          tenant_id: string
          tom_detectado?: string | null
          turno: number
          velocidade_resposta_s?: number | null
        }
        Update: {
          comprimento_msg?: number | null
          conversation_id?: string
          criado_em?: string
          id?: string
          lead_id?: string
          tenant_id?: string
          tom_detectado?: string | null
          turno?: number
          velocidade_resposta_s?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "engajamento_turnos_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engajamento_turnos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      episodios: {
        Row: {
          agente_id: string | null
          carga: Json
          conversa_id: string | null
          criado_em: string
          id: string
          importancia: number
          owner_id: string
          resumo: string
          tags: string[] | null
        }
        Insert: {
          agente_id?: string | null
          carga?: Json
          conversa_id?: string | null
          criado_em?: string
          id?: string
          importancia?: number
          owner_id: string
          resumo: string
          tags?: string[] | null
        }
        Update: {
          agente_id?: string | null
          carga?: Json
          conversa_id?: string | null
          criado_em?: string
          id?: string
          importancia?: number
          owner_id?: string
          resumo?: string
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "episodios_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodios_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodios_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estado_afetivo_lead: {
        Row: {
          agente_id: string
          ativacao: number
          atualizado_em: string
          confianca: number
          criado_em: string
          id: string
          lead_id: string
          resumo_humor: string | null
          tenant_id: string
          ultima_ruptura_em: string | null
          valencia: number
        }
        Insert: {
          agente_id: string
          ativacao?: number
          atualizado_em?: string
          confianca?: number
          criado_em?: string
          id?: string
          lead_id: string
          resumo_humor?: string | null
          tenant_id: string
          ultima_ruptura_em?: string | null
          valencia?: number
        }
        Update: {
          agente_id?: string
          ativacao?: number
          atualizado_em?: string
          confianca?: number
          criado_em?: string
          id?: string
          lead_id?: string
          resumo_humor?: string | null
          tenant_id?: string
          ultima_ruptura_em?: string | null
          valencia?: number
        }
        Relationships: [
          {
            foreignKeyName: "estado_afetivo_lead_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      estado_digitacao: {
        Row: {
          agente_digitando: boolean
          agente_digitando_at: string | null
          conversation_id: string
          is_typing: boolean | null
          last_typing_at: string | null
          updated_at: string | null
        }
        Insert: {
          agente_digitando?: boolean
          agente_digitando_at?: string | null
          conversation_id: string
          is_typing?: boolean | null
          last_typing_at?: string | null
          updated_at?: string | null
        }
        Update: {
          agente_digitando?: boolean
          agente_digitando_at?: string | null
          conversation_id?: string
          is_typing?: boolean | null
          last_typing_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estado_digitacao_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_itens: {
        Row: {
          categoria: string | null
          created_at: string
          deleted_at: string | null
          id: string
          nome: string
          preco_custo_centavos: number | null
          quantidade: number
          quantidade_minima: number
          sku: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome: string
          preco_custo_centavos?: number | null
          quantidade?: number
          quantidade_minima?: number
          sku?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          preco_custo_centavos?: number | null
          quantidade?: number
          quantidade_minima?: number
          sku?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_itens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_movimentacoes: {
        Row: {
          created_at: string
          id: string
          item_id: string
          motivo: string | null
          quantidade: number
          tenant_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          motivo?: string | null
          quantidade: number
          tenant_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          motivo?: string | null
          quantidade?: number
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentacoes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "estoque_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_agenda: {
        Row: {
          convidados: Json
          cor: string
          created_at: string
          criado_por: string
          deleted_at: string | null
          descricao: string | null
          dia_inteiro: boolean
          fim_em: string | null
          id: string
          inicio_em: string
          lembretes: Json
          origem: string
          sala_reuniao_id: string | null
          status: string
          tenant_id: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          convidados?: Json
          cor?: string
          created_at?: string
          criado_por: string
          deleted_at?: string | null
          descricao?: string | null
          dia_inteiro?: boolean
          fim_em?: string | null
          id?: string
          inicio_em: string
          lembretes?: Json
          origem?: string
          sala_reuniao_id?: string | null
          status?: string
          tenant_id: string
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          convidados?: Json
          cor?: string
          created_at?: string
          criado_por?: string
          deleted_at?: string | null
          descricao?: string | null
          dia_inteiro?: boolean
          fim_em?: string | null
          id?: string
          inicio_em?: string
          lembretes?: Json
          origem?: string
          sala_reuniao_id?: string | null
          status?: string
          tenant_id?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_agenda_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_agenda_sala_reuniao_id_fkey"
            columns: ["sala_reuniao_id"]
            isOneToOne: false
            referencedRelation: "salas_reuniao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_agenda_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_lead: {
        Row: {
          carga: Json | null
          cliente_id: string | null
          conversa_id: string | null
          criado_em: string
          id: string
          tipo: string
        }
        Insert: {
          carga?: Json | null
          cliente_id?: string | null
          conversa_id?: string | null
          criado_em?: string
          id?: string
          tipo: string
        }
        Update: {
          carga?: Json | null
          cliente_id?: string | null
          conversa_id?: string | null
          criado_em?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_lead_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_lead_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_perfil_publico: {
        Row: {
          created_at: string
          event_type: string
          id: number
          metadata: Json | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          metadata?: Json | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          metadata?: Json | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      exclusoes_tenant: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exclusoes_tenant_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exclusoes_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      execucoes_padrao: {
        Row: {
          batch_id: string
          cenario_id: string
          criado_em: string
          custo_brl: number
          diff: Json | null
          duracao_ms: number | null
          erro: string | null
          esperado: Json | null
          id: string
          is_regression: boolean
          modelo: string | null
          obtido: Json | null
          passou: boolean | null
        }
        Insert: {
          batch_id: string
          cenario_id: string
          criado_em?: string
          custo_brl?: number
          diff?: Json | null
          duracao_ms?: number | null
          erro?: string | null
          esperado?: Json | null
          id?: string
          is_regression?: boolean
          modelo?: string | null
          obtido?: Json | null
          passou?: boolean | null
        }
        Update: {
          batch_id?: string
          cenario_id?: string
          criado_em?: string
          custo_brl?: number
          diff?: Json | null
          duracao_ms?: number | null
          erro?: string | null
          esperado?: Json | null
          id?: string
          is_regression?: boolean
          modelo?: string | null
          obtido?: Json | null
          passou?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "golden_runs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "lotes_execucao_padrao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golden_runs_cenario_id_fkey"
            columns: ["cenario_id"]
            isOneToOne: false
            referencedRelation: "blocos_padrao"
            referencedColumns: ["id"]
          },
        ]
      }
      execucoes_simulacao: {
        Row: {
          agente_id: string
          bolhas: Json | null
          cenario_id: string | null
          conversa_id: string | null
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          modo: string
          owner_id: string
          resultado: Json | null
          status: string
        }
        Insert: {
          agente_id: string
          bolhas?: Json | null
          cenario_id?: string | null
          conversa_id?: string | null
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          modo: string
          owner_id: string
          resultado?: Json | null
          status?: string
        }
        Update: {
          agente_id?: string
          bolhas?: Json | null
          cenario_id?: string | null
          conversa_id?: string | null
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          modo?: string
          owner_id?: string
          resultado?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "execucoes_simulacao_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucoes_simulacao_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucoes_simulacao_cenario_id_fkey"
            columns: ["cenario_id"]
            isOneToOne: false
            referencedRelation: "cenarios_simulacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucoes_simulacao_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucoes_simulacao_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fase_requisitos: {
        Row: {
          agente_id: string | null
          ativo: boolean
          combinacao_evidencias: string | null
          created_at: string
          descricao_curta: string
          descricao_semantica: string
          embedding_status: string
          escopo: string
          evidencias: Json
          fase: string
          id: string
          nicho_id: string | null
          obrigatorio: boolean
          ordem: number
          produto_id: string | null
          tenant_id: string | null
          threshold: number | null
          updated_at: string
          vetor_semantico: unknown
        }
        Insert: {
          agente_id?: string | null
          ativo?: boolean
          combinacao_evidencias?: string | null
          created_at?: string
          descricao_curta: string
          descricao_semantica: string
          embedding_status?: string
          escopo?: string
          evidencias?: Json
          fase: string
          id?: string
          nicho_id?: string | null
          obrigatorio?: boolean
          ordem?: number
          produto_id?: string | null
          tenant_id?: string | null
          threshold?: number | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Update: {
          agente_id?: string | null
          ativo?: boolean
          combinacao_evidencias?: string | null
          created_at?: string
          descricao_curta?: string
          descricao_semantica?: string
          embedding_status?: string
          escopo?: string
          evidencias?: Json
          fase?: string
          id?: string
          nicho_id?: string | null
          obrigatorio?: boolean
          ordem?: number
          produto_id?: string | null
          tenant_id?: string | null
          threshold?: number | null
          updated_at?: string
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "fase_requisitos_agent_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fase_requisitos_agent_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fase_requisitos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fase_requisitos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fase_requisitos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fases_campanha: {
        Row: {
          campaign_id: string
          created_at: string
          description: string
          id: string
          instruction: string
          is_final_positive: boolean
          label: string
          order_index: number
          regra: string
          slots_obrigatorios: string[]
          slug: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          description?: string
          id?: string
          instruction?: string
          is_final_positive?: boolean
          label?: string
          order_index: number
          regra?: string
          slots_obrigatorios?: string[]
          slug: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          description?: string
          id?: string
          instruction?: string
          is_final_positive?: boolean
          label?: string
          order_index?: number
          regra?: string
          slots_obrigatorios?: string[]
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_phases_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_phases_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_gargalos_campanha_tenant"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      feriados_brasil: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          data: string
          escopo: string
          fonte: string
          id: string
          municipio: string | null
          nome: string
          observacao: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          data: string
          escopo?: string
          fonte?: string
          id?: string
          municipio?: string | null
          nome: string
          observacao?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          data?: string
          escopo?: string
          fonte?: string
          id?: string
          municipio?: string | null
          nome?: string
          observacao?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ferramentas_dinamicas: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string
          dominio_allowlist: string
          endpoint_url: string
          escopo: Database["public"]["Enums"]["escopo_ragentic"]
          id: string
          metodo: string
          nome_tool: string
          precisa_aprovacao: boolean
          schema_zod: Json
          tenant_id: string | null
          tipo_acesso: string
          vetor_semantico: unknown
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao: string
          dominio_allowlist: string
          endpoint_url: string
          escopo?: Database["public"]["Enums"]["escopo_ragentic"]
          id?: string
          metodo?: string
          nome_tool: string
          precisa_aprovacao?: boolean
          schema_zod: Json
          tenant_id?: string | null
          tipo_acesso?: string
          vetor_semantico?: unknown
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string
          dominio_allowlist?: string
          endpoint_url?: string
          escopo?: Database["public"]["Enums"]["escopo_ragentic"]
          id?: string
          metodo?: string
          nome_tool?: string
          precisa_aprovacao?: boolean
          schema_zod?: Json
          tenant_id?: string | null
          tipo_acesso?: string
          vetor_semantico?: unknown
        }
        Relationships: []
      }
      ferramentas_log: {
        Row: {
          agente_id: string | null
          cargo_id: string | null
          criado_em: string
          entrada: Json | null
          erro_msg: string | null
          ferramenta_id: string | null
          id: string
          latencia_ms: number | null
          nome_ferramenta: string
          saida: Json | null
          status: string
          tenant_id: string
          trace_id: string | null
        }
        Insert: {
          agente_id?: string | null
          cargo_id?: string | null
          criado_em?: string
          entrada?: Json | null
          erro_msg?: string | null
          ferramenta_id?: string | null
          id?: string
          latencia_ms?: number | null
          nome_ferramenta: string
          saida?: Json | null
          status: string
          tenant_id: string
          trace_id?: string | null
        }
        Update: {
          agente_id?: string | null
          cargo_id?: string | null
          criado_em?: string
          entrada?: Json | null
          erro_msg?: string | null
          ferramenta_id?: string | null
          id?: string
          latencia_ms?: number | null
          nome_ferramenta?: string
          saida?: Json | null
          status?: string
          tenant_id?: string
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ferramentas_log_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_log_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_log_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_log_ferramenta_id_fkey"
            columns: ["ferramenta_id"]
            isOneToOne: false
            referencedRelation: "ferramentas_dinamicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_log_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_log_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "vw_cerebro_turnos_recentes"
            referencedColumns: ["id"]
          },
        ]
      }
      ficha_do_lead: {
        Row: {
          agente_id: string | null
          atualizado_em: string
          campos: Json
          cliente_id: string | null
          conversa_id: string
          criado_em: string
          id: string
          tags: string[] | null
        }
        Insert: {
          agente_id?: string | null
          atualizado_em?: string
          campos?: Json
          cliente_id?: string | null
          conversa_id: string
          criado_em?: string
          id?: string
          tags?: string[] | null
        }
        Update: {
          agente_id?: string | null
          atualizado_em?: string
          campos?: Json
          cliente_id?: string | null
          conversa_id?: string
          criado_em?: string
          id?: string
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "ficha_do_lead_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_do_lead_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_do_lead_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_do_lead_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_lead: {
        Row: {
          agente_id: string
          ciclo: number | null
          conversation_id: string
          created_at: string | null
          dados_capturados: Json | null
          fase: string | null
          historico_fases: string[] | null
          id: string
          lead_id: string
          proximo_esperado: string | null
          resumo: string | null
          updated_at: string | null
        }
        Insert: {
          agente_id: string
          ciclo?: number | null
          conversation_id: string
          created_at?: string | null
          dados_capturados?: Json | null
          fase?: string | null
          historico_fases?: string[] | null
          id?: string
          lead_id: string
          proximo_esperado?: string | null
          resumo?: string | null
          updated_at?: string | null
        }
        Update: {
          agente_id?: string
          ciclo?: number | null
          conversation_id?: string
          created_at?: string | null
          dados_capturados?: Json | null
          fase?: string | null
          historico_fases?: string[] | null
          id?: string
          lead_id?: string
          proximo_esperado?: string | null
          resumo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_lead_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_lead_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_config_tenant: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          numero_dono: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          numero_dono?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          numero_dono?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      financeiro_numeros_autorizados: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          numero: string
          rotulo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          numero: string
          rotulo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          numero?: string
          rotulo?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      galeria_publica: {
        Row: {
          created_at: string
          descricao: string | null
          foto_url: string
          id: string
          ordem: number
          titulo: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          foto_url: string
          id?: string
          ordem?: number
          titulo?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          foto_url?: string
          id?: string
          ordem?: number
          titulo?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gatilhos_reativos: {
        Row: {
          acao_carga: Json
          acao_tipo: string
          ativo: boolean
          cargo_id: string | null
          cenario: string
          criado_em: string
          escopo: Database["public"]["Enums"]["escopo_ragentic"]
          id: string
          nicho_id: string | null
          origem: string
          ref_legado_id: string | null
          tenant_id: string | null
        }
        Insert: {
          acao_carga?: Json
          acao_tipo: string
          ativo?: boolean
          cargo_id?: string | null
          cenario: string
          criado_em?: string
          escopo?: Database["public"]["Enums"]["escopo_ragentic"]
          id?: string
          nicho_id?: string | null
          origem: string
          ref_legado_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          acao_carga?: Json
          acao_tipo?: string
          ativo?: boolean
          cargo_id?: string | null
          cenario?: string
          criado_em?: string
          escopo?: Database["public"]["Enums"]["escopo_ragentic"]
          id?: string
          nicho_id?: string | null
          origem?: string
          ref_legado_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gatilhos_reativos_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gatilhos_reativos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_estados_usados: {
        Row: {
          state_hash: string
          usado_em: string
        }
        Insert: {
          state_hash: string
          usado_em?: string
        }
        Update: {
          state_hash?: string
          usado_em?: string
        }
        Relationships: []
      }
      historico_config_chamadas_llm: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          chave: string
          custo_teto_diario: number | null
          escopo: string | null
          id: string
          itens_produzidos: string[]
          json_mode: boolean | null
          max_tokens: number
          modelo: string
          motivo: string | null
          nicho_id: string | null
          notas: string | null
          posicao: string | null
          prompt_template: string
          schedule: string | null
          temperatura: number
          tenant_id: string | null
          versao: number
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          chave: string
          custo_teto_diario?: number | null
          escopo?: string | null
          id?: string
          itens_produzidos: string[]
          json_mode?: boolean | null
          max_tokens: number
          modelo: string
          motivo?: string | null
          nicho_id?: string | null
          notas?: string | null
          posicao?: string | null
          prompt_template: string
          schedule?: string | null
          temperatura: number
          tenant_id?: string | null
          versao: number
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          chave?: string
          custo_teto_diario?: number | null
          escopo?: string | null
          id?: string
          itens_produzidos?: string[]
          json_mode?: boolean | null
          max_tokens?: number
          modelo?: string
          motivo?: string | null
          nicho_id?: string | null
          notas?: string | null
          posicao?: string | null
          prompt_template?: string
          schedule?: string | null
          temperatura?: number
          tenant_id?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "historico_config_chamadas_llm_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_config_chamadas_llm_config_id_fkey"
            columns: ["chave"]
            isOneToOne: false
            referencedRelation: "config_chamadas_llm"
            referencedColumns: ["chave"]
          },
        ]
      }
      impersonation_log: {
        Row: {
          admin_id: string
          ended_at: string | null
          id: string
          ip_address: string | null
          motivo: string | null
          started_at: string
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          admin_id: string
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          motivo?: string | null
          started_at?: string
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          admin_id?: string
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          motivo?: string | null
          started_at?: string
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      incidentes_seguranca: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          detalhes: Json | null
          id: string
          resolved: boolean | null
          severidade: string
          tenant_id: string | null
          tipo: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          resolved?: boolean | null
          severidade: string
          tenant_id?: string | null
          tipo: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          resolved?: boolean | null
          severidade?: string
          tenant_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_incidents_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incidents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intencoes_pendentes: {
        Row: {
          conversa_id: string
          criado_em: string
          dados: Json | null
          id: string
          intencao: string
          resolvida_em: string | null
        }
        Insert: {
          conversa_id: string
          criado_em?: string
          dados?: Json | null
          id?: string
          intencao: string
          resolvida_em?: string | null
        }
        Update: {
          conversa_id?: string
          criado_em?: string
          dados?: Json | null
          id?: string
          intencao?: string
          resolvida_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intencoes_pendentes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      invocacoes_ferramenta: {
        Row: {
          conversation_id: string
          criado_em: string
          deleted_at: string | null
          executado_em: string | null
          id: string
          input_validado: Json
          meta_bloco_id: string | null
          motivo: string | null
          resultado: Json | null
          status: string
          tenant_id: string
          tool_name: string
        }
        Insert: {
          conversation_id: string
          criado_em?: string
          deleted_at?: string | null
          executado_em?: string | null
          id?: string
          input_validado?: Json
          meta_bloco_id?: string | null
          motivo?: string | null
          resultado?: Json | null
          status?: string
          tenant_id: string
          tool_name: string
        }
        Update: {
          conversation_id?: string
          criado_em?: string
          deleted_at?: string | null
          executado_em?: string | null
          id?: string
          input_validado?: Json
          meta_bloco_id?: string | null
          motivo?: string | null
          resultado?: Json | null
          status?: string
          tenant_id?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_invocations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_invocations_meta_chunk_id_fkey"
            columns: ["meta_bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_invocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      juridico_interesses: {
        Row: {
          created_at: string
          id: string
          observacao: string
          servico_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          observacao?: string
          servico_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          observacao?: string
          servico_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "juridico_interesses_servico_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "juridico_servicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "juridico_interesses_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      juridico_servicos: {
        Row: {
          created_at: string
          deleted_at: string | null
          descricao: string
          id: string
          is_active: boolean
          nome: string
          ordem: number
          preco: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          id?: string
          is_active?: boolean
          nome: string
          ordem?: number
          preco?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          id?: string
          is_active?: boolean
          nome?: string
          ordem?: number
          preco?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          agente_id: string | null
          assigned_to: string | null
          canal_externo: string | null
          chave_rastreamento: string | null
          client_checkpoints: Json | null
          converted_at: string | null
          created_at: string | null
          custom_fields: Json
          dados_ficha: Json
          deleted_at: string | null
          desfecho: string | null
          desfecho_em: string | null
          desfecho_motivo: string | null
          divida_total: number | null
          email: string | null
          fase_cliente: string | null
          fase_pipeline: string | null
          id: string
          id_externo: string | null
          is_hot: boolean
          location: string
          mesclado_em: string | null
          name: string | null
          nome_exibicao: string | null
          nome_provedor: string | null
          opt_out_at: string | null
          origem_lead: string | null
          pasta_base_id: string | null
          perfil_estilo: Json | null
          phone: string | null
          pontuacao: number | null
          precisa_humano: boolean | null
          produto: string | null
          tags: string[] | null
          tarefas_cliente: Json | null
          temperatura_lead: string | null
          tenant_id: string | null
          total_mensagens: number | null
          ultima_resposta_lead_em: string | null
          updated_at: string | null
          url_foto_perfil: string | null
          valor_conversao: number | null
        }
        Insert: {
          agente_id?: string | null
          assigned_to?: string | null
          canal_externo?: string | null
          chave_rastreamento?: string | null
          client_checkpoints?: Json | null
          converted_at?: string | null
          created_at?: string | null
          custom_fields?: Json
          dados_ficha?: Json
          deleted_at?: string | null
          desfecho?: string | null
          desfecho_em?: string | null
          desfecho_motivo?: string | null
          divida_total?: number | null
          email?: string | null
          fase_cliente?: string | null
          fase_pipeline?: string | null
          id?: string
          id_externo?: string | null
          is_hot?: boolean
          location?: string
          mesclado_em?: string | null
          name?: string | null
          nome_exibicao?: string | null
          nome_provedor?: string | null
          opt_out_at?: string | null
          origem_lead?: string | null
          pasta_base_id?: string | null
          perfil_estilo?: Json | null
          phone?: string | null
          pontuacao?: number | null
          precisa_humano?: boolean | null
          produto?: string | null
          tags?: string[] | null
          tarefas_cliente?: Json | null
          temperatura_lead?: string | null
          tenant_id?: string | null
          total_mensagens?: number | null
          ultima_resposta_lead_em?: string | null
          updated_at?: string | null
          url_foto_perfil?: string | null
          valor_conversao?: number | null
        }
        Update: {
          agente_id?: string | null
          assigned_to?: string | null
          canal_externo?: string | null
          chave_rastreamento?: string | null
          client_checkpoints?: Json | null
          converted_at?: string | null
          created_at?: string | null
          custom_fields?: Json
          dados_ficha?: Json
          deleted_at?: string | null
          desfecho?: string | null
          desfecho_em?: string | null
          desfecho_motivo?: string | null
          divida_total?: number | null
          email?: string | null
          fase_cliente?: string | null
          fase_pipeline?: string | null
          id?: string
          id_externo?: string | null
          is_hot?: boolean
          location?: string
          mesclado_em?: string | null
          name?: string | null
          nome_exibicao?: string | null
          nome_provedor?: string | null
          opt_out_at?: string | null
          origem_lead?: string | null
          pasta_base_id?: string | null
          perfil_estilo?: Json | null
          phone?: string | null
          pontuacao?: number | null
          precisa_humano?: boolean | null
          produto?: string | null
          tags?: string[] | null
          tarefas_cliente?: Json | null
          temperatura_lead?: string | null
          tenant_id?: string | null
          total_mensagens?: number | null
          ultima_resposta_lead_em?: string | null
          updated_at?: string | null
          url_foto_perfil?: string | null
          valor_conversao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_mesclado_em_fkey"
            columns: ["mesclado_em"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pasta_base_id_fkey"
            columns: ["pasta_base_id"]
            isOneToOne: false
            referencedRelation: "pastas_base"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_campanha: {
        Row: {
          ab_variacao: string | null
          archived_at: string | null
          attempt_count: number
          campaign_id: string
          closed_at: string | null
          config_snapshot: Json | null
          created_at: string
          entered_at: string
          exit_reason: string | null
          id: string
          last_contact_at: string | null
          lead_id: string
          perfil_estilo: Json | null
          phase: string
          reproposta_count: number
          state: string
        }
        Insert: {
          ab_variacao?: string | null
          archived_at?: string | null
          attempt_count?: number
          campaign_id: string
          closed_at?: string | null
          config_snapshot?: Json | null
          created_at?: string
          entered_at?: string
          exit_reason?: string | null
          id?: string
          last_contact_at?: string | null
          lead_id: string
          perfil_estilo?: Json | null
          phase?: string
          reproposta_count?: number
          state?: string
        }
        Update: {
          ab_variacao?: string | null
          archived_at?: string | null
          attempt_count?: number
          campaign_id?: string
          closed_at?: string | null
          config_snapshot?: Json | null
          created_at?: string
          entered_at?: string
          exit_reason?: string | null
          id?: string
          last_contact_at?: string | null
          lead_id?: string
          perfil_estilo?: Json | null
          phase?: string
          reproposta_count?: number
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campanha_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_campanha_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_gargalos_campanha_tenant"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "leads_campanha_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      limiares_gatilho: {
        Row: {
          acao: string
          descricao: string | null
          threshold: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acao: string
          descricao?: string | null
          threshold: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acao?: string
          descricao?: string | null
          threshold?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      limites_taxa: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          identifier: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          identifier: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          identifier?: string
        }
        Relationships: []
      }
      listas_disparo_lead: {
        Row: {
          created_at: string
          criterios: Json
          deleted_at: string | null
          id: string
          lead_ids: string[] | null
          nome: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criterios?: Json
          deleted_at?: string | null
          id?: string
          lead_ids?: string[] | null
          nome: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criterios?: Json
          deleted_at?: string | null
          id?: string
          lead_ids?: string[] | null
          nome?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_disparo_lead_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lixeira_exclusoes: {
        Row: {
          comando: string | null
          excluido_em: string
          id: string
          linha: Json
          owner_id: string
          tabela: string
        }
        Insert: {
          comando?: string | null
          excluido_em?: string
          id?: string
          linha: Json
          owner_id: string
          tabela: string
        }
        Update: {
          comando?: string | null
          excluido_em?: string
          id?: string
          linha?: Json
          owner_id?: string
          tabela?: string
        }
        Relationships: []
      }
      log_acesso_contrato: {
        Row: {
          chave_publica: string
          created_at: string
          evento: string
          id: string
          ip: string | null
          meta: Json | null
          user_agent: string | null
        }
        Insert: {
          chave_publica: string
          created_at?: string
          evento: string
          id?: string
          ip?: string | null
          meta?: Json | null
          user_agent?: string | null
        }
        Update: {
          chave_publica?: string
          created_at?: string
          evento?: string
          id?: string
          ip?: string | null
          meta?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      logs_requisicao_llm: {
        Row: {
          created_at: string
          custo_total: number
          duracao_ms: number
          erro: string | null
          id: string
          metadata: Json
          model_id: string | null
          model_slug: string
          provider_id: string | null
          provider_nome: string
          status: string
          tipo: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          created_at?: string
          custo_total?: number
          duracao_ms?: number
          erro?: string | null
          id?: string
          metadata?: Json
          model_id?: string | null
          model_slug?: string
          provider_id?: string | null
          provider_nome?: string
          status?: string
          tipo?: string
          tokens_input?: number
          tokens_output?: number
        }
        Update: {
          created_at?: string
          custo_total?: number
          duracao_ms?: number
          erro?: string | null
          id?: string
          metadata?: Json
          model_id?: string | null
          model_slug?: string
          provider_id?: string | null
          provider_nome?: string
          status?: string
          tipo?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: [
          {
            foreignKeyName: "logs_requisicao_llm_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "modelos_llm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_requisicao_llm_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provedores_llm"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_aplicativos: {
        Row: {
          categoria: string
          created_at: string
          descricao: string
          icone: string
          id: string
          is_active: boolean
          nome: string
          ordem: number
          preco_mensal: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          descricao?: string
          icone?: string
          id?: string
          is_active?: boolean
          nome: string
          ordem?: number
          preco_mensal?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          descricao?: string
          icone?: string
          id?: string
          is_active?: boolean
          nome?: string
          ordem?: number
          preco_mensal?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      loja_implantacao: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          is_active: boolean | null
          nome: string
          preco: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_active?: boolean | null
          nome: string
          preco?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_active?: boolean | null
          nome?: string
          preco?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      loja_pacotes_extra: {
        Row: {
          conversas: number
          created_at: string | null
          descricao: string | null
          id: string
          is_active: boolean | null
          nome: string
          plano_id: string | null
          preco: number
          updated_at: string | null
        }
        Insert: {
          conversas?: number
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_active?: boolean | null
          nome: string
          plano_id?: string | null
          preco?: number
          updated_at?: string | null
        }
        Update: {
          conversas?: number
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_active?: boolean | null
          nome?: string
          plano_id?: string | null
          preco?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_pacotes_extra_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "loja_planos"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_planos: {
        Row: {
          created_at: string | null
          descricao: string | null
          dias_expiracao: number
          id: string
          is_active: boolean | null
          max_ciclos_por_conversa: number
          max_conversas: number
          max_storage_mb: number
          modelo_llm_id: string | null
          nome: string
          ordem: number | null
          preco_mensal: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          dias_expiracao?: number
          id?: string
          is_active?: boolean | null
          max_ciclos_por_conversa?: number
          max_conversas?: number
          max_storage_mb?: number
          modelo_llm_id?: string | null
          nome: string
          ordem?: number | null
          preco_mensal?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          dias_expiracao?: number
          id?: string
          is_active?: boolean | null
          max_ciclos_por_conversa?: number
          max_conversas?: number
          max_storage_mb?: number
          modelo_llm_id?: string | null
          nome?: string
          ordem?: number | null
          preco_mensal?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_planos_modelo_llm_id_fkey"
            columns: ["modelo_llm_id"]
            isOneToOne: false
            referencedRelation: "modelos_llm"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_plus: {
        Row: {
          comissao_implantacao_pct: number
          comissao_recorrente_pct: number
          created_at: string | null
          descricao: string | null
          detalhes: string | null
          id: string
          is_active: boolean | null
          multinivel: boolean | null
          nome: string
          preco: number
          updated_at: string | null
        }
        Insert: {
          comissao_implantacao_pct?: number
          comissao_recorrente_pct?: number
          created_at?: string | null
          descricao?: string | null
          detalhes?: string | null
          id?: string
          is_active?: boolean | null
          multinivel?: boolean | null
          nome: string
          preco?: number
          updated_at?: string | null
        }
        Update: {
          comissao_implantacao_pct?: number
          comissao_recorrente_pct?: number
          created_at?: string | null
          descricao?: string | null
          detalhes?: string | null
          id?: string
          is_active?: boolean | null
          multinivel?: boolean | null
          nome?: string
          preco?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      lotes_execucao_padrao: {
        Row: {
          custo_brl: number
          duracao_ms: number
          escopo: string
          finalizado_em: string | null
          id: string
          iniciado_em: string
          iniciado_por: string | null
          modelo: string | null
          nicho_id: string | null
          status: string
          tenant_id: string | null
          titulo: string | null
          total_cenarios: number
          total_falhou: number
          total_passou: number
          total_regression: number
        }
        Insert: {
          custo_brl?: number
          duracao_ms?: number
          escopo?: string
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          iniciado_por?: string | null
          modelo?: string | null
          nicho_id?: string | null
          status?: string
          tenant_id?: string | null
          titulo?: string | null
          total_cenarios?: number
          total_falhou?: number
          total_passou?: number
          total_regression?: number
        }
        Update: {
          custo_brl?: number
          duracao_ms?: number
          escopo?: string
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          iniciado_por?: string | null
          modelo?: string | null
          nicho_id?: string | null
          status?: string
          tenant_id?: string | null
          titulo?: string | null
          total_cenarios?: number
          total_falhou?: number
          total_passou?: number
          total_regression?: number
        }
        Relationships: [
          {
            foreignKeyName: "golden_run_batches_iniciado_por_fkey"
            columns: ["iniciado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golden_run_batches_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golden_run_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manipulacao_blocos: {
        Row: {
          ativo: boolean
          criado_em: string
          deleted_at: string | null
          embedding_status: string
          escopo: string
          exemplos: Json | null
          id: string
          mensagem_retorno: string | null
          nicho_id: string | null
          pausa_min: number | null
          resposta_padrao: string
          severidade: string
          tenant_id: string | null
          tipo: string
          updated_at: string | null
          vetor_semantico: unknown
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          exemplos?: Json | null
          id?: string
          mensagem_retorno?: string | null
          nicho_id?: string | null
          pausa_min?: number | null
          resposta_padrao: string
          severidade: string
          tenant_id?: string | null
          tipo: string
          updated_at?: string | null
          vetor_semantico?: unknown
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          deleted_at?: string | null
          embedding_status?: string
          escopo?: string
          exemplos?: Json | null
          id?: string
          mensagem_retorno?: string | null
          nicho_id?: string | null
          pausa_min?: number | null
          resposta_padrao?: string
          severidade?: string
          tenant_id?: string | null
          tipo?: string
          updated_at?: string | null
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "manipulacao_blocos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      manipulacao_log: {
        Row: {
          acao_tomada: string
          bolha_enviada: string | null
          conversation_id: string | null
          criado_em: string
          detector_metodo: string | null
          detector_score: number | null
          id: string
          lead_id: string | null
          manipulacao_bloco_id: string | null
          msg_lead_excerpt: string | null
          severidade: string
          tenant_id: string
          tipo: string
        }
        Insert: {
          acao_tomada: string
          bolha_enviada?: string | null
          conversation_id?: string | null
          criado_em?: string
          detector_metodo?: string | null
          detector_score?: number | null
          id?: string
          lead_id?: string | null
          manipulacao_bloco_id?: string | null
          msg_lead_excerpt?: string | null
          severidade: string
          tenant_id: string
          tipo: string
        }
        Update: {
          acao_tomada?: string
          bolha_enviada?: string | null
          conversation_id?: string | null
          criado_em?: string
          detector_metodo?: string | null
          detector_score?: number | null
          id?: string
          lead_id?: string | null
          manipulacao_bloco_id?: string | null
          msg_lead_excerpt?: string | null
          severidade?: string
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "manipulacao_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manipulacao_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manipulacao_log_manipulacao_chunk_id_fkey"
            columns: ["manipulacao_bloco_id"]
            isOneToOne: false
            referencedRelation: "manipulacao_blocos"
            referencedColumns: ["id"]
          },
        ]
      }
      mapa_emocao_afeto: {
        Row: {
          ativacao: number
          criado_em: string
          emocao: string
          valencia: number
        }
        Insert: {
          ativacao: number
          criado_em?: string
          emocao: string
          valencia: number
        }
        Update: {
          ativacao?: number
          criado_em?: string
          emocao?: string
          valencia?: number
        }
        Relationships: []
      }
      mapa_fase_gatilho_campanha: {
        Row: {
          campaign_type: string
          created_at: string
          exit_reason: string | null
          id: string
          target_phase: string
          target_state: string
          trigger_name: string
        }
        Insert: {
          campaign_type: string
          created_at?: string
          exit_reason?: string | null
          id?: string
          target_phase: string
          target_state?: string
          trigger_name: string
        }
        Update: {
          campaign_type?: string
          created_at?: string
          exit_reason?: string | null
          id?: string
          target_phase?: string
          target_state?: string
          trigger_name?: string
        }
        Relationships: []
      }
      memoria_dono: {
        Row: {
          ativa: boolean
          atualizado_em: string
          categoria: string
          criado_em: string
          fato: string
          id: string
          origem_conversa_id: string | null
          owner_id: string
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          categoria?: string
          criado_em?: string
          fato: string
          id?: string
          origem_conversa_id?: string | null
          owner_id: string
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          categoria?: string
          criado_em?: string
          fato?: string
          id?: string
          origem_conversa_id?: string | null
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memoria_dono_origem_conversa_id_fkey"
            columns: ["origem_conversa_id"]
            isOneToOne: false
            referencedRelation: "mentor_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      memoria_episodica: {
        Row: {
          ativa: boolean
          atualizado_em: string
          conversation_id: string
          criado_em: string
          decay_factor: number
          duracao_turnos: number | null
          embedding_status: string
          emocao: string | null
          episodio_resumo: string
          gancho: string | null
          id: string
          lead_id: string | null
          outcome: string | null
          relevancia: number
          tenant_id: string
          turno_fim: number
          turno_inicio: number
          vetor_semantico: unknown
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          conversation_id: string
          criado_em?: string
          decay_factor?: number
          duracao_turnos?: number | null
          embedding_status?: string
          emocao?: string | null
          episodio_resumo: string
          gancho?: string | null
          id?: string
          lead_id?: string | null
          outcome?: string | null
          relevancia?: number
          tenant_id: string
          turno_fim: number
          turno_inicio: number
          vetor_semantico?: unknown
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          conversation_id?: string
          criado_em?: string
          decay_factor?: number
          duracao_turnos?: number | null
          embedding_status?: string
          emocao?: string | null
          episodio_resumo?: string
          gancho?: string | null
          id?: string
          lead_id?: string | null
          outcome?: string | null
          relevancia?: number
          tenant_id?: string
          turno_fim?: number
          turno_inicio?: number
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "memoria_episodica_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memoria_episodica_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memoria_episodica_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memoria_lead: {
        Row: {
          ativa: boolean
          atualizado_em: string
          categoria: string
          confianca: number
          confirmado_em: string | null
          confirmado_pelo_lead: boolean
          confirmado_por: string | null
          conversation_id: string | null
          created_by: string | null
          criado_em: string
          destilado_em: string | null
          embedding_status: string
          escopo: string
          fato: string
          fonte: string
          fonte_turno: number | null
          id: string
          lead_id: string
          modulo: string | null
          origem_curto_ids: string[] | null
          relevancia: string
          sistema_expirou_em: string | null
          tenant_id: string
          ultima_evocacao_em: string | null
          valencia_emocional: number
          valido_ate: string | null
          valido_desde: string | null
          vetor_semantico: unknown
          vezes_evocado: number
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          categoria?: string
          confianca?: number
          confirmado_em?: string | null
          confirmado_pelo_lead?: boolean
          confirmado_por?: string | null
          conversation_id?: string | null
          created_by?: string | null
          criado_em?: string
          destilado_em?: string | null
          embedding_status?: string
          escopo?: string
          fato: string
          fonte?: string
          fonte_turno?: number | null
          id?: string
          lead_id: string
          modulo?: string | null
          origem_curto_ids?: string[] | null
          relevancia?: string
          sistema_expirou_em?: string | null
          tenant_id: string
          ultima_evocacao_em?: string | null
          valencia_emocional?: number
          valido_ate?: string | null
          valido_desde?: string | null
          vetor_semantico?: unknown
          vezes_evocado?: number
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          categoria?: string
          confianca?: number
          confirmado_em?: string | null
          confirmado_pelo_lead?: boolean
          confirmado_por?: string | null
          conversation_id?: string | null
          created_by?: string | null
          criado_em?: string
          destilado_em?: string | null
          embedding_status?: string
          escopo?: string
          fato?: string
          fonte?: string
          fonte_turno?: number | null
          id?: string
          lead_id?: string
          modulo?: string | null
          origem_curto_ids?: string[] | null
          relevancia?: string
          sistema_expirou_em?: string | null
          tenant_id?: string
          ultima_evocacao_em?: string | null
          valencia_emocional?: number
          valido_ate?: string | null
          valido_desde?: string | null
          vetor_semantico?: unknown
          vezes_evocado?: number
        }
        Relationships: [
          {
            foreignKeyName: "memoria_lead_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memoria_lead_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memoria_lead_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memoria_lead_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memoria_lead_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          blocos_acionados: Json[] | null
          campaign_lead_id: string | null
          carga: Json | null
          categoria_anexo: string | null
          content: string
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          entregue_at: string | null
          id: string
          role: string
          sender_id: string | null
          zapi_message_id: string | null
        }
        Insert: {
          blocos_acionados?: Json[] | null
          campaign_lead_id?: string | null
          carga?: Json | null
          categoria_anexo?: string | null
          content: string
          conversation_id: string
          created_at?: string | null
          deleted_at?: string | null
          entregue_at?: string | null
          id?: string
          role: string
          sender_id?: string | null
          zapi_message_id?: string | null
        }
        Update: {
          blocos_acionados?: Json[] | null
          campaign_lead_id?: string | null
          carga?: Json | null
          categoria_anexo?: string | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          deleted_at?: string | null
          entregue_at?: string | null
          id?: string
          role?: string
          sender_id?: string | null
          zapi_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "leads_campanha"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_suporte: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          sender_role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_anotacoes: {
        Row: {
          atualizado_em: string
          conteudo: string
          conversa_mentor_id: string | null
          criado_em: string
          id: string
          tags: string[]
          tenant_id: string
        }
        Insert: {
          atualizado_em?: string
          conteudo: string
          conversa_mentor_id?: string | null
          criado_em?: string
          id?: string
          tags?: string[]
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          conteudo?: string
          conversa_mentor_id?: string | null
          criado_em?: string
          id?: string
          tags?: string[]
          tenant_id?: string
        }
        Relationships: []
      }
      mentor_conversas: {
        Row: {
          atualizado_em: string
          canal: string
          criado_em: string
          id: string
          numero_wpp: string | null
          owner_id: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          canal?: string
          criado_em?: string
          id?: string
          numero_wpp?: string | null
          owner_id: string
          titulo?: string
        }
        Update: {
          atualizado_em?: string
          canal?: string
          criado_em?: string
          id?: string
          numero_wpp?: string | null
          owner_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_conversas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_mensagens: {
        Row: {
          conteudo: string | null
          conversa_id: string
          criado_em: string
          id: string
          papel: string
          tags: string[]
          tool_calls: Json | null
        }
        Insert: {
          conteudo?: string | null
          conversa_id: string
          criado_em?: string
          id?: string
          papel: string
          tags?: string[]
          tool_calls?: Json | null
        }
        Update: {
          conteudo?: string | null
          conversa_id?: string
          criado_em?: string
          id?: string
          papel?: string
          tags?: string[]
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "mentor_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_tag_regras: {
        Row: {
          criado_em: string
          padrao: string
          tag: string
        }
        Insert: {
          criado_em?: string
          padrao: string
          tag: string
        }
        Update: {
          criado_em?: string
          padrao?: string
          tag?: string
        }
        Relationships: []
      }
      meta_indicacao_campanha: {
        Row: {
          campaign_id: string
          chave_publica: string
          comissao_tipo: string
          comissao_valor: number
          comprovante_url: string | null
          concluida_at: string | null
          created_at: string
          cupom: string
          indicador_email: string | null
          indicador_foto_url: string | null
          indicador_nome: string
          indicador_telefone: string | null
          observacao: string | null
          pagamento_data: string | null
          pagamento_metodo: string | null
          pagamento_valor: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          chave_publica?: string
          comissao_tipo: string
          comissao_valor: number
          comprovante_url?: string | null
          concluida_at?: string | null
          created_at?: string
          cupom: string
          indicador_email?: string | null
          indicador_foto_url?: string | null
          indicador_nome: string
          indicador_telefone?: string | null
          observacao?: string | null
          pagamento_data?: string | null
          pagamento_metodo?: string | null
          pagamento_valor?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          chave_publica?: string
          comissao_tipo?: string
          comissao_valor?: number
          comprovante_url?: string | null
          concluida_at?: string | null
          created_at?: string
          cupom?: string
          indicador_email?: string | null
          indicador_foto_url?: string | null
          indicador_nome?: string
          indicador_telefone?: string | null
          observacao?: string | null
          pagamento_data?: string | null
          pagamento_metodo?: string | null
          pagamento_valor?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_indicacao_meta_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_indicacao_meta_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "v_gargalos_campanha_tenant"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_indicacao_meta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_financeiras: {
        Row: {
          atualizado_em: string
          criado_em: string
          deleted_at: string | null
          foto_path: string | null
          id: string
          status: string
          tenant_id: string
          titulo: string
          valor_alvo: number
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          deleted_at?: string | null
          foto_path?: string | null
          id?: string
          status?: string
          tenant_id: string
          titulo: string
          valor_alvo: number
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          deleted_at?: string | null
          foto_path?: string | null
          id?: string
          status?: string
          tenant_id?: string
          titulo?: string
          valor_alvo?: number
        }
        Relationships: []
      }
      metricas_agente_diario: {
        Row: {
          agente_id: string
          dia: string
          id: string
          metricas: Json
        }
        Insert: {
          agente_id: string
          dia: string
          id?: string
          metricas?: Json
        }
        Update: {
          agente_id?: string
          dia?: string
          id?: string
          metricas?: Json
        }
        Relationships: [
          {
            foreignKeyName: "metricas_agente_diario_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metricas_agente_diario_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_llm: {
        Row: {
          context_window: number
          created_at: string
          custo_input_1m: number
          custo_output_1m: number
          id: string
          is_active: boolean
          is_default: boolean
          nome: string
          provider_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          context_window?: number
          created_at?: string
          custo_input_1m?: number
          custo_output_1m?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          nome: string
          provider_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          context_window?: number
          created_at?: string
          custo_input_1m?: number
          custo_output_1m?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          nome?: string
          provider_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_llm_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provedores_llm"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentos_financeiros: {
        Row: {
          atualizado_em: string
          carga: Json | null
          categoria: string | null
          categoria_id: string | null
          conta_id: string | null
          criado_em: string
          data_movimento: string | null
          deleted_at: string | null
          descricao: string | null
          documento_id: string | null
          id: string
          lead_id: string | null
          meta_id: string | null
          origem: string
          owner_id: string
          tipo: string
          valor: number
        }
        Insert: {
          atualizado_em?: string
          carga?: Json | null
          categoria?: string | null
          categoria_id?: string | null
          conta_id?: string | null
          criado_em?: string
          data_movimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          documento_id?: string | null
          id?: string
          lead_id?: string | null
          meta_id?: string | null
          origem?: string
          owner_id: string
          tipo: string
          valor: number
        }
        Update: {
          atualizado_em?: string
          carga?: Json | null
          categoria?: string | null
          categoria_id?: string | null
          conta_id?: string | null
          criado_em?: string
          data_movimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          documento_id?: string | null
          id?: string
          lead_id?: string | null
          meta_id?: string | null
          origem?: string
          owner_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentos_financeiros_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_a_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_financeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "metas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      multinivel_comissoes: {
        Row: {
          beneficiario_id: string
          created_at: string | null
          id: string
          nivel: number
          origem_id: string
          percentual: number
          purchase_order_id: string
          status: string
          valor_base: number
          valor_comissao: number
        }
        Insert: {
          beneficiario_id: string
          created_at?: string | null
          id?: string
          nivel: number
          origem_id: string
          percentual: number
          purchase_order_id: string
          status?: string
          valor_base: number
          valor_comissao: number
        }
        Update: {
          beneficiario_id?: string
          created_at?: string | null
          id?: string
          nivel?: number
          origem_id?: string
          percentual?: number
          purchase_order_id?: string
          status?: string
          valor_base?: number
          valor_comissao?: number
        }
        Relationships: [
          {
            foreignKeyName: "multinivel_comissoes_beneficiario_id_fkey"
            columns: ["beneficiario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multinivel_comissoes_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multinivel_comissoes_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      multinivel_niveis: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          is_active: boolean | null
          nivel: number
          tipo_produto: string
          tipo_valor: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_active?: boolean | null
          nivel: number
          tipo_produto?: string
          tipo_valor?: string
          updated_at?: string | null
          valor?: number
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          is_active?: boolean | null
          nivel?: number
          tipo_produto?: string
          tipo_valor?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: []
      }
      multinivel_saques: {
        Row: {
          chave_pix: string | null
          comprovante_url: string | null
          created_at: string | null
          id: string
          metodo: string | null
          observacao: string | null
          status: string
          updated_at: string | null
          user_id: string
          valor: number
        }
        Insert: {
          chave_pix?: string | null
          comprovante_url?: string | null
          created_at?: string | null
          id?: string
          metodo?: string | null
          observacao?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
          valor: number
        }
        Update: {
          chave_pix?: string | null
          comprovante_url?: string | null
          created_at?: string | null
          id?: string
          metodo?: string | null
          observacao?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "multinivel_saques_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nichos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome_exibicao: string
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome_exibicao: string
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome_exibicao?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      notas_app: {
        Row: {
          checks: Json
          conteudo: string
          cor: string
          cravada: boolean
          created_at: string
          data_lembrete: string | null
          deleted_at: string | null
          id: string
          posicao: Json | null
          status: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checks?: Json
          conteudo?: string
          cor?: string
          cravada?: boolean
          created_at?: string
          data_lembrete?: string | null
          deleted_at?: string | null
          id?: string
          posicao?: Json | null
          status?: string
          titulo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checks?: Json
          conteudo?: string
          cor?: string
          cravada?: boolean
          created_at?: string
          data_lembrete?: string | null
          deleted_at?: string | null
          id?: string
          posicao?: Json | null
          status?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_app_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          acao: string | null
          acao_label: string | null
          created_at: string
          foto_url: string | null
          icone: string
          id: string
          lida: boolean
          lida_em: string | null
          mensagem: string | null
          midia_tipo: string | null
          midia_url: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          acao?: string | null
          acao_label?: string | null
          created_at?: string
          foto_url?: string | null
          icone?: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          mensagem?: string | null
          midia_tipo?: string | null
          midia_url?: string | null
          tipo?: string
          titulo: string
          user_id: string
        }
        Update: {
          acao?: string | null
          acao_label?: string | null
          created_at?: string
          foto_url?: string | null
          icone?: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          mensagem?: string | null
          midia_tipo?: string | null
          midia_url?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      numeros_rifa: {
        Row: {
          created_at: string
          id: string
          numero: number
          pedido_id: string
          rifa_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          numero: number
          pedido_id: string
          rifa_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          numero?: number
          pedido_id?: string
          rifa_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "numeros_rifa_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_rifa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numeros_rifa_rifa_id_fkey"
            columns: ["rifa_id"]
            isOneToOne: false
            referencedRelation: "rifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numeros_rifa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      observacoes_tag: {
        Row: {
          contexto_excerto: string | null
          conversation_id: string | null
          criado_em: string
          emocao_dominante: string | null
          fonte: string
          id: string
          intensidade: number | null
          lead_id: string | null
          tag_text: string
          tenant_id: string
        }
        Insert: {
          contexto_excerto?: string | null
          conversation_id?: string | null
          criado_em?: string
          emocao_dominante?: string | null
          fonte?: string
          id?: string
          intensidade?: number | null
          lead_id?: string | null
          tag_text: string
          tenant_id: string
        }
        Update: {
          contexto_excerto?: string | null
          conversation_id?: string | null
          criado_em?: string
          emocao_dominante?: string | null
          fonte?: string
          id?: string
          intensidade?: number | null
          lead_id?: string | null
          tag_text?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_observations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_observations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_observations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamento_porteiro_diario: {
        Row: {
          atualizado_em: string
          data: string
          escopo: string
          gasto_centesimos: number
          identificador: string
          tentativas: number
        }
        Insert: {
          atualizado_em?: string
          data: string
          escopo: string
          gasto_centesimos?: number
          identificador?: string
          tentativas?: number
        }
        Update: {
          atualizado_em?: string
          data?: string
          escopo?: string
          gasto_centesimos?: number
          identificador?: string
          tentativas?: number
        }
        Relationships: []
      }
      orcamento_uso: {
        Row: {
          agente_id: string | null
          criado_em: string
          custo: number
          id: string
          modelo: string
          owner_id: string
          tokens_entrada: number
          tokens_saida: number
        }
        Insert: {
          agente_id?: string | null
          criado_em?: string
          custo?: number
          id?: string
          modelo: string
          owner_id: string
          tokens_entrada?: number
          tokens_saida?: number
        }
        Update: {
          agente_id?: string | null
          criado_em?: string
          custo?: number
          id?: string
          modelo?: string
          owner_id?: string
          tokens_entrada?: number
          tokens_saida?: number
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_uso_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_uso_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_uso_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_tenant_blocos_anti_padroes: {
        Row: {
          ativo: boolean
          bloco_id: string
          criado_em: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          bloco_id: string
          criado_em?: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          bloco_id?: string
          criado_em?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_tenant_blocos_anti_padroes_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "anti_padroes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overrides_tenant_blocos_anti_padroes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_tenant_blocos_comportamento: {
        Row: {
          ativo: boolean
          bloco_id: string
          criado_em: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          bloco_id: string
          criado_em?: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          bloco_id?: string
          criado_em?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_tenant_blocos_comportamento_chunk_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_comportamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overrides_tenant_blocos_comportamento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_tenant_blocos_conhecimento: {
        Row: {
          ativo: boolean
          bloco_id: string
          criado_em: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          bloco_id: string
          criado_em?: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          bloco_id?: string
          criado_em?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_tenant_blocos_conhecimento_chunk_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_conhecimento"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_tenant_blocos_emocao: {
        Row: {
          ativo: boolean
          bloco_id: string
          criado_em: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          bloco_id: string
          criado_em?: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          bloco_id?: string
          criado_em?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_tenant_blocos_emocao_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "emocao_blocos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overrides_tenant_blocos_emocao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_tenant_blocos_gatilho: {
        Row: {
          ativo: boolean
          bloco_id: string
          criado_em: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          bloco_id: string
          criado_em?: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          bloco_id?: string
          criado_em?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_tenant_blocos_gatilho_chunk_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_gatilho"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_tenant_blocos_humanizacao: {
        Row: {
          ativo: boolean
          bloco_id: string
          criado_em: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          bloco_id: string
          criado_em?: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          bloco_id?: string
          criado_em?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_tenant_blocos_humanizacao_chunk_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_humanizacao"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_tenant_blocos_procedurais: {
        Row: {
          ativo: boolean
          bloco_id: string
          criado_em: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          bloco_id: string
          criado_em?: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          bloco_id?: string
          criado_em?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_tenant_blocos_procedurais_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_procedurais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overrides_tenant_blocos_procedurais_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_tenant_blocos_prova_social: {
        Row: {
          ativo: boolean
          bloco_id: string
          criado_em: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          bloco_id: string
          criado_em?: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          bloco_id?: string
          criado_em?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_tenant_blocos_prova_social_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "prova_social_blocos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overrides_tenant_blocos_prova_social_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_tenant_blocos_variacao: {
        Row: {
          ativo: boolean
          bloco_id: string
          criado_em: string
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          bloco_id: string
          criado_em?: string
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          bloco_id?: string
          criado_em?: string
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_tenant_blocos_variacao_chunk_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_variacao"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          carga: Json | null
          cliente_id: string | null
          criado_em: string
          id: string
          metodo: string | null
          owner_id: string
          status: string
          valor: number
        }
        Insert: {
          carga?: Json | null
          cliente_id?: string | null
          criado_em?: string
          id?: string
          metodo?: string | null
          owner_id: string
          status?: string
          valor: number
        }
        Update: {
          carga?: Json | null
          cliente_id?: string | null
          criado_em?: string
          id?: string
          metodo?: string | null
          owner_id?: string
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_cliente: {
        Row: {
          comprovante_rejected_motivo: string | null
          contrato_id: string | null
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          id: string
          lead_id: string
          metodo_pagamento: string | null
          observacao: string | null
          origem_mensagem_id: string | null
          status: string
          tenant_id: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          comprovante_rejected_motivo?: string | null
          contrato_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          descricao?: string
          id?: string
          lead_id: string
          metodo_pagamento?: string | null
          observacao?: string | null
          origem_mensagem_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string | null
          valor?: number
        }
        Update: {
          comprovante_rejected_motivo?: string | null
          contrato_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          id?: string
          lead_id?: string
          metodo_pagamento?: string | null
          observacao?: string | null
          origem_mensagem_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_cliente_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_cliente_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_legacy_en"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_cliente_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_cliente_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pastas_base: {
        Row: {
          criado_em: string
          deleted_at: string | null
          id: string
          nome: string
          tenant_id: string
        }
        Insert: {
          criado_em?: string
          deleted_at?: string | null
          id?: string
          nome: string
          tenant_id: string
        }
        Update: {
          criado_em?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastas_base_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pausa_conversa: {
        Row: {
          conversation_id: string
          criado_em: string
          encerrado_em: string | null
          id: string
          modo: string
          motivo: string | null
          reativar_em: string | null
          tenant_id: string
        }
        Insert: {
          conversation_id: string
          criado_em?: string
          encerrado_em?: string | null
          id?: string
          modo: string
          motivo?: string | null
          reativar_em?: string | null
          tenant_id: string
        }
        Update: {
          conversation_id?: string
          criado_em?: string
          encerrado_em?: string | null
          id?: string
          modo?: string
          motivo?: string | null
          reativar_em?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_pause_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra: {
        Row: {
          comprovante_url: string | null
          created_at: string | null
          id: string
          item_id: string
          item_nome: string
          item_preco: number
          observacao_admin: string | null
          status: string
          tipo: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comprovante_url?: string | null
          created_at?: string | null
          id?: string
          item_id: string
          item_nome: string
          item_preco?: number
          observacao_admin?: string | null
          status?: string
          tipo: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comprovante_url?: string | null
          created_at?: string | null
          id?: string
          item_id?: string
          item_nome?: string
          item_preco?: number
          observacao_admin?: string | null
          status?: string
          tipo?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_rifa: {
        Row: {
          chave_publica: string
          comprovante_url: string | null
          conversa_id: string | null
          created_at: string
          expira_em: string | null
          id: string
          lead_id: string | null
          motivo_rejeicao: string | null
          nome: string
          numeros: number[]
          origem: string
          pago_em: string | null
          phone: string
          qtd_numeros: number
          rifa_id: string
          status: string
          tenant_id: string
          updated_at: string
          utm: Json | null
          valor_centavos: number
        }
        Insert: {
          chave_publica?: string
          comprovante_url?: string | null
          conversa_id?: string | null
          created_at?: string
          expira_em?: string | null
          id?: string
          lead_id?: string | null
          motivo_rejeicao?: string | null
          nome: string
          numeros: number[]
          origem?: string
          pago_em?: string | null
          phone: string
          qtd_numeros: number
          rifa_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          utm?: Json | null
          valor_centavos: number
        }
        Update: {
          chave_publica?: string
          comprovante_url?: string | null
          conversa_id?: string | null
          created_at?: string
          expira_em?: string | null
          id?: string
          lead_id?: string | null
          motivo_rejeicao?: string | null
          nome?: string
          numeros?: number[]
          origem?: string
          pago_em?: string | null
          phone?: string
          qtd_numeros?: number
          rifa_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          utm?: Json | null
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_rifa_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_rifa_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_rifa_rifa_id_fkey"
            columns: ["rifa_id"]
            isOneToOne: false
            referencedRelation: "rifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_rifa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_empresa: {
        Row: {
          argumentos_ganhadores: Json
          argumentos_perdedores: Json
          atualizado_em: string
          conversas_destiladas: number
          criado_em: string
          destilacao_ultima_em: string | null
          id: string
          nome_fantasia: string | null
          origem_por_campo: Json
          perfil_lead_ideal: Json
          prazo_decisao_medio_dias: number | null
          razao_social: string | null
          segmento: string | null
          taxa_conversao_estimada: number | null
          tenant_id: string
          ticket_medio_estimado: number | null
          top_diferenciais: Json
          top_objecoes: Json
          top_pontos_dor: Json
          versao: number
        }
        Insert: {
          argumentos_ganhadores?: Json
          argumentos_perdedores?: Json
          atualizado_em?: string
          conversas_destiladas?: number
          criado_em?: string
          destilacao_ultima_em?: string | null
          id?: string
          nome_fantasia?: string | null
          origem_por_campo?: Json
          perfil_lead_ideal?: Json
          prazo_decisao_medio_dias?: number | null
          razao_social?: string | null
          segmento?: string | null
          taxa_conversao_estimada?: number | null
          tenant_id: string
          ticket_medio_estimado?: number | null
          top_diferenciais?: Json
          top_objecoes?: Json
          top_pontos_dor?: Json
          versao?: number
        }
        Update: {
          argumentos_ganhadores?: Json
          argumentos_perdedores?: Json
          atualizado_em?: string
          conversas_destiladas?: number
          criado_em?: string
          destilacao_ultima_em?: string | null
          id?: string
          nome_fantasia?: string | null
          origem_por_campo?: Json
          perfil_lead_ideal?: Json
          prazo_decisao_medio_dias?: number | null
          razao_social?: string | null
          segmento?: string | null
          taxa_conversao_estimada?: number | null
          tenant_id?: string
          ticket_medio_estimado?: number | null
          top_diferenciais?: Json
          top_objecoes?: Json
          top_pontos_dor?: Json
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "perfil_empresa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_publico: {
        Row: {
          agent_capabilities: Json
          agent_enabled: boolean
          agent_nome: string | null
          chips: Json
          created_at: string
          cta_texto: string | null
          cta_tipo: string | null
          headline: string | null
          id: string
          is_active: boolean
          quick_replies: Json
          show_agent_online_badge: boolean
          slug: string
          subheadline: string | null
          updated_at: string
          user_id: string
          video_youtube_url: string | null
          youtube_canal_url: string | null
        }
        Insert: {
          agent_capabilities?: Json
          agent_enabled?: boolean
          agent_nome?: string | null
          chips?: Json
          created_at?: string
          cta_texto?: string | null
          cta_tipo?: string | null
          headline?: string | null
          id?: string
          is_active?: boolean
          quick_replies?: Json
          show_agent_online_badge?: boolean
          slug: string
          subheadline?: string | null
          updated_at?: string
          user_id: string
          video_youtube_url?: string | null
          youtube_canal_url?: string | null
        }
        Update: {
          agent_capabilities?: Json
          agent_enabled?: boolean
          agent_nome?: string | null
          chips?: Json
          created_at?: string
          cta_texto?: string | null
          cta_tipo?: string | null
          headline?: string | null
          id?: string
          is_active?: boolean
          quick_replies?: Json
          show_agent_online_badge?: boolean
          slug?: string
          subheadline?: string | null
          updated_at?: string
          user_id?: string
          video_youtube_url?: string | null
          youtube_canal_url?: string | null
        }
        Relationships: []
      }
      perguntas_orfas: {
        Row: {
          atualizado_em: string
          cluster_id: string | null
          criado_em: string
          embedding_amostra: string | null
          id: string
          intents_inferidas: string[]
          num_leads: number
          num_perguntas: number
          pergunta_representativa: string
          resolvido: boolean
          resolvido_bloco_id: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          tenant_id: string | null
          titulo: string | null
        }
        Insert: {
          atualizado_em?: string
          cluster_id?: string | null
          criado_em?: string
          embedding_amostra?: string | null
          id?: string
          intents_inferidas?: string[]
          num_leads?: number
          num_perguntas?: number
          pergunta_representativa: string
          resolvido?: boolean
          resolvido_bloco_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          tenant_id?: string | null
          titulo?: string | null
        }
        Update: {
          atualizado_em?: string
          cluster_id?: string | null
          criado_em?: string
          embedding_amostra?: string | null
          id?: string
          intents_inferidas?: string[]
          num_leads?: number
          num_perguntas?: number
          pergunta_representativa?: string
          resolvido?: boolean
          resolvido_bloco_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          tenant_id?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orphan_questions_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orphan_questions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perguntas_sem_resposta: {
        Row: {
          agente_id: string | null
          bloco_criado_id: string | null
          cluster_id: string | null
          contexto: string | null
          conversation_id: string | null
          criado_em: string
          eh_reusavel: boolean | null
          escopo_proposto: string | null
          gaveta_proposta: string | null
          id: string
          lead_id: string | null
          ocorrencias: number
          pergunta: string
          pergunta_para_mentor: string | null
          resolvido: boolean
          resolvido_em: string | null
          respondida_em: string | null
          respondida_por: string | null
          resposta_do_dono: string | null
          status_loop: string
          tenant_id: string
          ultima_ocorrencia: string
          vetor_semantico: unknown
        }
        Insert: {
          agente_id?: string | null
          bloco_criado_id?: string | null
          cluster_id?: string | null
          contexto?: string | null
          conversation_id?: string | null
          criado_em?: string
          eh_reusavel?: boolean | null
          escopo_proposto?: string | null
          gaveta_proposta?: string | null
          id?: string
          lead_id?: string | null
          ocorrencias?: number
          pergunta: string
          pergunta_para_mentor?: string | null
          resolvido?: boolean
          resolvido_em?: string | null
          respondida_em?: string | null
          respondida_por?: string | null
          resposta_do_dono?: string | null
          status_loop?: string
          tenant_id: string
          ultima_ocorrencia?: string
          vetor_semantico?: unknown
        }
        Update: {
          agente_id?: string | null
          bloco_criado_id?: string | null
          cluster_id?: string | null
          contexto?: string | null
          conversation_id?: string | null
          criado_em?: string
          eh_reusavel?: boolean | null
          escopo_proposto?: string | null
          gaveta_proposta?: string | null
          id?: string
          lead_id?: string | null
          ocorrencias?: number
          pergunta?: string
          pergunta_para_mentor?: string | null
          resolvido?: boolean
          resolvido_em?: string | null
          respondida_em?: string | null
          respondida_por?: string | null
          resposta_do_dono?: string | null
          status_loop?: string
          tenant_id?: string
          ultima_ocorrencia?: string
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "perguntas_sem_resposta_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_sem_resposta_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_sem_resposta_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_sem_resposta_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_sem_resposta_respondida_por_fkey"
            columns: ["respondida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_sem_resposta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pilha_objetivos: {
        Row: {
          atualizado_em: string
          contexto: string | null
          conversa_id: string
          criado_em: string
          deleted_at: string | null
          fechado_em: string | null
          id: string
          lead_id: string | null
          motivo_fechamento: string | null
          objetivo: string
          origem: string
          prioridade: number
          status: string
          tenant_id: string
        }
        Insert: {
          atualizado_em?: string
          contexto?: string | null
          conversa_id: string
          criado_em?: string
          deleted_at?: string | null
          fechado_em?: string | null
          id?: string
          lead_id?: string | null
          motivo_fechamento?: string | null
          objetivo: string
          origem?: string
          prioridade?: number
          status?: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          contexto?: string | null
          conversa_id?: string
          criado_em?: string
          deleted_at?: string | null
          fechado_em?: string | null
          id?: string
          lead_id?: string | null
          motivo_fechamento?: string | null
          objetivo?: string
          origem?: string
          prioridade?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilha_objetivos_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      pivots_categoria_intent: {
        Row: {
          ativo: boolean | null
          categorias_alvo: string[]
          criado_em: string | null
          embedding_status: string | null
          frase_pivo: string
          id: string
          intent: string
          vetor_semantico: unknown
        }
        Insert: {
          ativo?: boolean | null
          categorias_alvo: string[]
          criado_em?: string | null
          embedding_status?: string | null
          frase_pivo: string
          id?: string
          intent: string
          vetor_semantico?: unknown
        }
        Update: {
          ativo?: boolean | null
          categorias_alvo?: string[]
          criado_em?: string | null
          embedding_status?: string | null
          frase_pivo?: string
          id?: string
          intent?: string
          vetor_semantico?: unknown
        }
        Relationships: []
      }
      prancheta: {
        Row: {
          belief: Json
          belief_historico: Json
          conversation_id: string
          created_at: string
          estilo_lead: string | null
          id: string
          origem_planejamento: string | null
          proxima_intencao: Json | null
          proximo_passo_previsto: string | null
          resumo_agente: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          belief?: Json
          belief_historico?: Json
          conversation_id: string
          created_at?: string
          estilo_lead?: string | null
          id?: string
          origem_planejamento?: string | null
          proxima_intencao?: Json | null
          proximo_passo_previsto?: string | null
          resumo_agente?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          belief?: Json
          belief_historico?: Json
          conversation_id?: string
          created_at?: string
          estilo_lead?: string | null
          id?: string
          origem_planejamento?: string | null
          proxima_intencao?: Json | null
          proximo_passo_previsto?: string | null
          resumo_agente?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crenca_conversa_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      preferencias_notificacao_usuario: {
        Row: {
          atualizado_em: string
          modulos_silenciados: string[]
          navegador_ativo: boolean
          som_ativo: boolean
          som_handoff_ativo: boolean
          som_handoff_id: string | null
          som_id: string | null
          titulo_piscante_ativo: boolean
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          modulos_silenciados?: string[]
          navegador_ativo?: boolean
          som_ativo?: boolean
          som_handoff_ativo?: boolean
          som_handoff_id?: string | null
          som_id?: string | null
          titulo_piscante_ativo?: boolean
          user_id: string
        }
        Update: {
          atualizado_em?: string
          modulos_silenciados?: string[]
          navegador_ativo?: boolean
          som_ativo?: boolean
          som_handoff_ativo?: boolean
          som_handoff_id?: string | null
          som_id?: string | null
          titulo_piscante_ativo?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notif_prefs_som_handoff_id_fkey"
            columns: ["som_handoff_id"]
            isOneToOne: false
            referencedRelation: "sons_notificacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notif_prefs_som_id_fkey"
            columns: ["som_id"]
            isOneToOne: false
            referencedRelation: "sons_notificacao"
            referencedColumns: ["id"]
          },
        ]
      }
      preferencias_ui_usuario: {
        Row: {
          apps_fixados: Json
          badges_zerados: Json
          created_at: string
          papel_parede_id: string
          updated_at: string
          user_id: string
          widgets_ativos: Json
          widgets_posicoes: Json
        }
        Insert: {
          apps_fixados?: Json
          badges_zerados?: Json
          created_at?: string
          papel_parede_id?: string
          updated_at?: string
          user_id: string
          widgets_ativos?: Json
          widgets_posicoes?: Json
        }
        Update: {
          apps_fixados?: Json
          badges_zerados?: Json
          created_at?: string
          papel_parede_id?: string
          updated_at?: string
          user_id?: string
          widgets_ativos?: Json
          widgets_posicoes?: Json
        }
        Relationships: []
      }
      produto_conhecimento: {
        Row: {
          conteudo: string | null
          created_at: string | null
          id: string
          ordem: number | null
          produto_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          conteudo?: string | null
          created_at?: string | null
          id?: string
          ordem?: number | null
          produto_id: string
          tipo?: string
          titulo?: string
        }
        Update: {
          conteudo?: string | null
          created_at?: string | null
          id?: string
          ordem?: number | null
          produto_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_conhecimento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_midias: {
        Row: {
          arquivo_nome: string
          arquivo_tipo: string
          arquivo_url: string
          created_at: string
          descricao: string
          id: string
          ordem: number
          produto_id: string
        }
        Insert: {
          arquivo_nome?: string
          arquivo_tipo?: string
          arquivo_url: string
          created_at?: string
          descricao?: string
          id?: string
          ordem?: number
          produto_id: string
        }
        Update: {
          arquivo_nome?: string
          arquivo_tipo?: string
          arquivo_url?: string
          created_at?: string
          descricao?: string
          id?: string
          ordem?: number
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_midias_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_templates: {
        Row: {
          ativo: boolean
          created_at: string
          garantia: string | null
          id: string
          nicho_id: string
          nome: string
          prazo_entrega: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          garantia?: string | null
          id?: string
          nicho_id: string
          nome: string
          prazo_entrega?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          garantia?: string | null
          id?: string
          nicho_id?: string
          nome?: string
          prazo_entrega?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_templates_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          agente_id: string | null
          ativo: boolean
          atualizado_em: string
          campos_cliente: Json
          clausulas_contrato: string | null
          created_at: string | null
          criado_em: string
          descricao_curta: string | null
          entrada_centavos: number
          exigencias: Json | null
          garantia: string | null
          id: string
          max_parcelas: number
          metadata: Json
          nicho_id: string | null
          nome: string
          ordem: number
          owner_id: string | null
          palavras_chave: string[] | null
          parcelas_oferecidas: number[] | null
          prazo_entrega: string | null
          preco_centavos: number | null
          slug: string | null
          tipo_produto_id: string | null
          updated_at: string | null
          user_id: string
          valor_parcela_cravado_centavos: number | null
        }
        Insert: {
          agente_id?: string | null
          ativo?: boolean
          atualizado_em?: string
          campos_cliente?: Json
          clausulas_contrato?: string | null
          created_at?: string | null
          criado_em?: string
          descricao_curta?: string | null
          entrada_centavos?: number
          exigencias?: Json | null
          garantia?: string | null
          id?: string
          max_parcelas?: number
          metadata?: Json
          nicho_id?: string | null
          nome?: string
          ordem?: number
          owner_id?: string | null
          palavras_chave?: string[] | null
          parcelas_oferecidas?: number[] | null
          prazo_entrega?: string | null
          preco_centavos?: number | null
          slug?: string | null
          tipo_produto_id?: string | null
          updated_at?: string | null
          user_id: string
          valor_parcela_cravado_centavos?: number | null
        }
        Update: {
          agente_id?: string | null
          ativo?: boolean
          atualizado_em?: string
          campos_cliente?: Json
          clausulas_contrato?: string | null
          created_at?: string | null
          criado_em?: string
          descricao_curta?: string | null
          entrada_centavos?: number
          exigencias?: Json | null
          garantia?: string | null
          id?: string
          max_parcelas?: number
          metadata?: Json
          nicho_id?: string | null
          nome?: string
          ordem?: number
          owner_id?: string | null
          palavras_chave?: string[] | null
          parcelas_oferecidas?: number[] | null
          prazo_entrega?: string | null
          preco_centavos?: number | null
          slug?: string | null
          tipo_produto_id?: string | null
          updated_at?: string | null
          user_id?: string
          valor_parcela_cravado_centavos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_tipo_produto_id_fkey"
            columns: ["tipo_produto_id"]
            isOneToOne: false
            referencedRelation: "tipos_de_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          apelido: string | null
          avatar_url: string | null
          campaign_settings: Json
          cargo: string | null
          chave_pix: string | null
          cnpj: string | null
          created_at: string | null
          deleted_at: string | null
          deletion_requested_at: string | null
          document: string | null
          email: string
          full_name: string
          id: string
          indicator_commission_pct: number | null
          is_active: boolean | null
          metadata: Json | null
          multinivel_ativo: boolean | null
          nicho_id: string | null
          page_permissions: string[] | null
          parent_user_id: string | null
          phone: string | null
          razao_social: string | null
          referral_code: string | null
          referred_by: string | null
          saldo_multinivel: number | null
          system_role: string
          termos_aceitos: boolean | null
          termos_aceitos_em: string | null
          tipo_pessoa: string | null
          ultimo_acesso_em: string | null
          updated_at: string | null
        }
        Insert: {
          account_status?: string
          apelido?: string | null
          avatar_url?: string | null
          campaign_settings?: Json
          cargo?: string | null
          chave_pix?: string | null
          cnpj?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          document?: string | null
          email?: string
          full_name?: string
          id: string
          indicator_commission_pct?: number | null
          is_active?: boolean | null
          metadata?: Json | null
          multinivel_ativo?: boolean | null
          nicho_id?: string | null
          page_permissions?: string[] | null
          parent_user_id?: string | null
          phone?: string | null
          razao_social?: string | null
          referral_code?: string | null
          referred_by?: string | null
          saldo_multinivel?: number | null
          system_role?: string
          termos_aceitos?: boolean | null
          termos_aceitos_em?: string | null
          tipo_pessoa?: string | null
          ultimo_acesso_em?: string | null
          updated_at?: string | null
        }
        Update: {
          account_status?: string
          apelido?: string | null
          avatar_url?: string | null
          campaign_settings?: Json
          cargo?: string | null
          chave_pix?: string | null
          cnpj?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          document?: string | null
          email?: string
          full_name?: string
          id?: string
          indicator_commission_pct?: number | null
          is_active?: boolean | null
          metadata?: Json | null
          multinivel_ativo?: boolean | null
          nicho_id?: string | null
          page_permissions?: string[] | null
          parent_user_id?: string | null
          phone?: string | null
          razao_social?: string | null
          referral_code?: string | null
          referred_by?: string | null
          saldo_multinivel?: number | null
          system_role?: string
          termos_aceitos?: boolean | null
          termos_aceitos_em?: string | null
          tipo_pessoa?: string | null
          ultimo_acesso_em?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts_mensagem: {
        Row: {
          blocos_usados: Json | null
          bolhas_count: number | null
          conversation_id: string
          created_at: string
          fase_atual: string | null
          intent_gemma_raw: string | null
          message_id: string
          modelo: string | null
          rag_ativacao: Json | null
          requisitos_progresso: Json | null
          retrieval_waves: number | null
          system_prompt: string
          tokens: Json | null
          trigger_disparado: Json | null
          trigger_rejeitado: Json | null
          turno_tipo: string | null
          user_message: string
          verifier_pass_count: number | null
        }
        Insert: {
          blocos_usados?: Json | null
          bolhas_count?: number | null
          conversation_id: string
          created_at?: string
          fase_atual?: string | null
          intent_gemma_raw?: string | null
          message_id: string
          modelo?: string | null
          rag_ativacao?: Json | null
          requisitos_progresso?: Json | null
          retrieval_waves?: number | null
          system_prompt: string
          tokens?: Json | null
          trigger_disparado?: Json | null
          trigger_rejeitado?: Json | null
          turno_tipo?: string | null
          user_message: string
          verifier_pass_count?: number | null
        }
        Update: {
          blocos_usados?: Json | null
          bolhas_count?: number | null
          conversation_id?: string
          created_at?: string
          fase_atual?: string | null
          intent_gemma_raw?: string | null
          message_id?: string
          modelo?: string | null
          rag_ativacao?: Json | null
          requisitos_progresso?: Json | null
          retrieval_waves?: number | null
          system_prompt?: string
          tokens?: Json | null
          trigger_disparado?: Json | null
          trigger_rejeitado?: Json | null
          turno_tipo?: string | null
          user_message?: string
          verifier_pass_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_prompts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_prompts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts_turno: {
        Row: {
          agente_id: string | null
          blocos: Json | null
          conversa_id: string
          criado_em: string
          id: string
          lead_id: string | null
          modelo_llm: string | null
          prompt_completo: string
          tenant_id: string
        }
        Insert: {
          agente_id?: string | null
          blocos?: Json | null
          conversa_id: string
          criado_em?: string
          id?: string
          lead_id?: string | null
          modelo_llm?: string | null
          prompt_completo: string
          tenant_id: string
        }
        Update: {
          agente_id?: string | null
          blocos?: Json | null
          conversa_id?: string
          criado_em?: string
          id?: string
          lead_id?: string | null
          modelo_llm?: string | null
          prompt_completo?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_turno_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas_aprendizado: {
        Row: {
          agente_id: string | null
          conteudo: Json
          criado_em: string
          id: string
          origem: string
          status: string
        }
        Insert: {
          agente_id?: string | null
          conteudo?: Json
          criado_em?: string
          id?: string
          origem: string
          status?: string
        }
        Update: {
          agente_id?: string | null
          conteudo?: Json
          criado_em?: string
          id?: string
          origem?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "propostas_aprendizado_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_aprendizado_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas_do_sono: {
        Row: {
          conteudo: Json
          criado_em: string
          id: string
          origem: string
          status: string
        }
        Insert: {
          conteudo?: Json
          criado_em?: string
          id?: string
          origem: string
          status?: string
        }
        Update: {
          conteudo?: Json
          criado_em?: string
          id?: string
          origem?: string
          status?: string
        }
        Relationships: []
      }
      prova_social_blocos: {
        Row: {
          ativo: boolean
          autor: string
          criado_em: string
          deleted_at: string | null
          depoimento: string
          embedding_status: string
          escopo: string
          id: string
          idade: number | null
          lead_origem: string | null
          nicho_id: string | null
          real_world_valid_from: string | null
          real_world_valid_to: string | null
          tenant_id: string | null
          updated_at: string | null
          vetor_semantico: unknown
        }
        Insert: {
          ativo?: boolean
          autor: string
          criado_em?: string
          deleted_at?: string | null
          depoimento: string
          embedding_status?: string
          escopo?: string
          id?: string
          idade?: number | null
          lead_origem?: string | null
          nicho_id?: string | null
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          vetor_semantico?: unknown
        }
        Update: {
          ativo?: boolean
          autor?: string
          criado_em?: string
          deleted_at?: string | null
          depoimento?: string
          embedding_status?: string
          escopo?: string
          id?: string
          idade?: number | null
          lead_origem?: string | null
          nicho_id?: string | null
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          vetor_semantico?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "prova_social_blocos_lead_origem_fkey"
            columns: ["lead_origem"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prova_social_blocos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      provedores_llm: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          is_active: boolean
          nome: string
          slug: string
          updated_at: string
        }
        Insert: {
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          nome: string
          slug: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          nome?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_tenant: {
        Row: {
          contador: number
          janela: string
          tenant_id: string
        }
        Insert: {
          contador?: number
          janela: string
          tenant_id: string
        }
        Update: {
          contador?: number
          janela?: string
          tenant_id?: string
        }
        Relationships: []
      }
      recursos_ativacao_curadoria: {
        Row: {
          ativo: boolean | null
          atualizado_em: string
          atualizado_por: string | null
          categoria: string
          chave_recurso: string
          criado_em: string
          cron_nome: string | null
          custo_estimado_mes_brl: number
          dependencias_chaves: string[]
          descricao_curta: string
          descricao_longa: string | null
          edge_function: string | null
          id: string
          motivo_bloqueio: string | null
          nome_comercial: string
          ordem: number
          status: string
          tipo: string
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string
          atualizado_por?: string | null
          categoria: string
          chave_recurso: string
          criado_em?: string
          cron_nome?: string | null
          custo_estimado_mes_brl?: number
          dependencias_chaves?: string[]
          descricao_curta: string
          descricao_longa?: string | null
          edge_function?: string | null
          id?: string
          motivo_bloqueio?: string | null
          nome_comercial: string
          ordem?: number
          status?: string
          tipo: string
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string
          atualizado_por?: string | null
          categoria?: string
          chave_recurso?: string
          criado_em?: string
          cron_nome?: string | null
          custo_estimado_mes_brl?: number
          dependencias_chaves?: string[]
          descricao_curta?: string
          descricao_longa?: string | null
          edge_function?: string | null
          id?: string
          motivo_bloqueio?: string | null
          nome_comercial?: string
          ordem?: number
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "recursos_ativacao_curadoria_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registro_fusao_tag: {
        Row: {
          applied_at: string
          applied_by: string | null
          id: string
          nicho_id: string | null
          num_observacoes_movidas: number
          origem_suggestion_id: string | null
          tag_destino: string
          tag_origem: string
          tenant_id: string | null
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          id?: string
          nicho_id?: string | null
          num_observacoes_movidas?: number
          origem_suggestion_id?: string | null
          tag_destino: string
          tag_origem: string
          tenant_id?: string | null
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          id?: string
          nicho_id?: string | null
          num_observacoes_movidas?: number
          origem_suggestion_id?: string | null
          tag_destino?: string
          tag_origem?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registro_fusao_tag_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_fusao_tag_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_fusao_tag_origem_suggestion_id_fkey"
            columns: ["origem_suggestion_id"]
            isOneToOne: false
            referencedRelation: "sugestoes_fusao_tag"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_fusao_tag_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registro_purge: {
        Row: {
          erro: string | null
          executado_em: string
          id: number
          linhas_apagadas: number
          tabela: string
        }
        Insert: {
          erro?: string | null
          executado_em?: string
          id?: never
          linhas_apagadas: number
          tabela: string
        }
        Update: {
          erro?: string | null
          executado_em?: string
          id?: never
          linhas_apagadas?: number
          tabela?: string
        }
        Relationships: []
      }
      registro_reflexao: {
        Row: {
          atualizado_em: string
          conversation_id: string
          criado_em: string
          deleted_at: string | null
          detalhe_verificador: Json | null
          id: string
          licao_gerada: string | null
          meta_bloco_criado_id: string | null
          motivo_falha: string
          resposta_original: string | null
          status: string
          tenant_id: string
          turno_numero: number | null
        }
        Insert: {
          atualizado_em?: string
          conversation_id: string
          criado_em?: string
          deleted_at?: string | null
          detalhe_verificador?: Json | null
          id?: string
          licao_gerada?: string | null
          meta_bloco_criado_id?: string | null
          motivo_falha: string
          resposta_original?: string | null
          status?: string
          tenant_id: string
          turno_numero?: number | null
        }
        Update: {
          atualizado_em?: string
          conversation_id?: string
          criado_em?: string
          deleted_at?: string | null
          detalhe_verificador?: Json | null
          id?: string
          licao_gerada?: string | null
          meta_bloco_criado_id?: string | null
          motivo_falha?: string
          resposta_original?: string | null
          status?: string
          tenant_id?: string
          turno_numero?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reflection_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reflection_log_meta_chunk_criado_id_fkey"
            columns: ["meta_bloco_criado_id"]
            isOneToOne: false
            referencedRelation: "blocos_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reflection_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registro_uso_api: {
        Row: {
          completion_tokens: number | null
          conversation_id: string | null
          cost_usd: number | null
          created_at: string | null
          id: string
          latency_ms: number | null
          model: string | null
          prompt_tokens: number | null
          request_preview: string | null
          response_preview: string | null
          tenant_id: string | null
          total_tokens: number | null
        }
        Insert: {
          completion_tokens?: number | null
          conversation_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          request_preview?: string | null
          response_preview?: string | null
          tenant_id?: string | null
          total_tokens?: number | null
        }
        Update: {
          completion_tokens?: number | null
          conversation_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          request_preview?: string | null
          response_preview?: string | null
          tenant_id?: string | null
          total_tokens?: number | null
        }
        Relationships: []
      }
      regras_operacionais_blocos: {
        Row: {
          ativo: boolean
          categoria: string
          contexto: string
          criado_em: string
          criado_por: string | null
          deleted_at: string | null
          embedding_status: string | null
          escopo: string
          id: string
          motivo_criacao: string | null
          nicho_id: string | null
          parametros: Json
          prioridade: number
          real_world_valid_from: string | null
          real_world_valid_to: string | null
          regra: string
          tenant_id: string | null
          updated_at: string | null
          versao: number | null
          vetor_semantico: unknown
          vezes_usado: number | null
        }
        Insert: {
          ativo?: boolean
          categoria: string
          contexto: string
          criado_em?: string
          criado_por?: string | null
          deleted_at?: string | null
          embedding_status?: string | null
          escopo: string
          id?: string
          motivo_criacao?: string | null
          nicho_id?: string | null
          parametros?: Json
          prioridade?: number
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          regra: string
          tenant_id?: string | null
          updated_at?: string | null
          versao?: number | null
          vetor_semantico?: unknown
          vezes_usado?: number | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          contexto?: string
          criado_em?: string
          criado_por?: string | null
          deleted_at?: string | null
          embedding_status?: string | null
          escopo?: string
          id?: string
          motivo_criacao?: string | null
          nicho_id?: string | null
          parametros?: Json
          prioridade?: number
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          regra?: string
          tenant_id?: string | null
          updated_at?: string | null
          versao?: number | null
          vetor_semantico?: unknown
          vezes_usado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "regras_operacionais_blocos_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      reino_avaliacoes: {
        Row: {
          atualizado_em: string
          comentario: string | null
          criado_em: string
          empresa_id: string
          estrelas: number
          id: string
          usuario_id: string
        }
        Insert: {
          atualizado_em?: string
          comentario?: string | null
          criado_em?: string
          empresa_id: string
          estrelas: number
          id?: string
          usuario_id: string
        }
        Update: {
          atualizado_em?: string
          comentario?: string | null
          criado_em?: string
          empresa_id?: string
          estrelas?: number
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reino_avaliacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "reino_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reino_avaliacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reino_cidades: {
        Row: {
          estado_id: string
          id: string
          nome: string
        }
        Insert: {
          estado_id: string
          id?: string
          nome: string
        }
        Update: {
          estado_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "reino_cidades_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "reino_estados"
            referencedColumns: ["id"]
          },
        ]
      }
      reino_empresa_fotos: {
        Row: {
          criado_em: string
          empresa_id: string
          id: string
          principal: boolean
          url: string
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          id?: string
          principal?: boolean
          url: string
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          id?: string
          principal?: boolean
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "reino_empresa_fotos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "reino_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      reino_empresas: {
        Row: {
          abrangencia: string | null
          bairro: string | null
          categoria: string | null
          cep: string | null
          cidade_id: string | null
          contato: string | null
          criado_em: string
          criado_por: string | null
          descricao: string | null
          endereco: string | null
          estado_id: string | null
          foto_perfil: string | null
          horario: Json | null
          id: string
          nicho_id: string | null
          nome: string
          regiao_id: string | null
          telefone: string | null
          tipo: string | null
          website: string | null
        }
        Insert: {
          abrangencia?: string | null
          bairro?: string | null
          categoria?: string | null
          cep?: string | null
          cidade_id?: string | null
          contato?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          endereco?: string | null
          estado_id?: string | null
          foto_perfil?: string | null
          horario?: Json | null
          id?: string
          nicho_id?: string | null
          nome: string
          regiao_id?: string | null
          telefone?: string | null
          tipo?: string | null
          website?: string | null
        }
        Update: {
          abrangencia?: string | null
          bairro?: string | null
          categoria?: string | null
          cep?: string | null
          cidade_id?: string | null
          contato?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          endereco?: string | null
          estado_id?: string | null
          foto_perfil?: string | null
          horario?: Json | null
          id?: string
          nicho_id?: string | null
          nome?: string
          regiao_id?: string | null
          telefone?: string | null
          tipo?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reino_empresas_cidade_id_fkey"
            columns: ["cidade_id"]
            isOneToOne: false
            referencedRelation: "reino_cidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reino_empresas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reino_empresas_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "reino_estados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reino_empresas_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "reino_nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reino_empresas_regiao_id_fkey"
            columns: ["regiao_id"]
            isOneToOne: false
            referencedRelation: "reino_regioes"
            referencedColumns: ["id"]
          },
        ]
      }
      reino_estados: {
        Row: {
          id: string
          nome: string
          regiao_id: string
        }
        Insert: {
          id?: string
          nome: string
          regiao_id: string
        }
        Update: {
          id?: string
          nome?: string
          regiao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reino_estados_regiao_id_fkey"
            columns: ["regiao_id"]
            isOneToOne: false
            referencedRelation: "reino_regioes"
            referencedColumns: ["id"]
          },
        ]
      }
      reino_nichos: {
        Row: {
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      reino_regioes: {
        Row: {
          id: string
          nome: string
        }
        Insert: {
          id?: string
          nome: string
        }
        Update: {
          id?: string
          nome?: string
        }
        Relationships: []
      }
      reino_titulos: {
        Row: {
          descricao: string | null
          id: string
          mensalidade: number | null
          nome: string
          ordem: number | null
        }
        Insert: {
          descricao?: string | null
          id?: string
          mensalidade?: number | null
          nome: string
          ordem?: number | null
        }
        Update: {
          descricao?: string | null
          id?: string
          mensalidade?: number | null
          nome?: string
          ordem?: number | null
        }
        Relationships: []
      }
      rifa_agendamentos_disparo: {
        Row: {
          ativo: boolean
          atualizado_em: string
          contatos_ids: string[] | null
          criado_em: string
          horario: string
          id: string
          mensagem: string | null
          rifa_id: string
          tempo_descanso_segundos: number
          tenant_id: string
          tipo_conteudo: string
          ultima_execucao_dia: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          contatos_ids?: string[] | null
          criado_em?: string
          horario: string
          id?: string
          mensagem?: string | null
          rifa_id: string
          tempo_descanso_segundos?: number
          tenant_id: string
          tipo_conteudo: string
          ultima_execucao_dia?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          contatos_ids?: string[] | null
          criado_em?: string
          horario?: string
          id?: string
          mensagem?: string | null
          rifa_id?: string
          tempo_descanso_segundos?: number
          tenant_id?: string
          tipo_conteudo?: string
          ultima_execucao_dia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rifa_agendamentos_disparo_rifa_id_fkey"
            columns: ["rifa_id"]
            isOneToOne: false
            referencedRelation: "rifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifa_agendamentos_disparo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rifa_bom_dia_envios: {
        Row: {
          conversa_id: string | null
          created_at: string
          dia: string
          followup_em: string | null
          id: string
          lead_id: string
          rifa_id: string
          saudado_em: string
          tenant_id: string
        }
        Insert: {
          conversa_id?: string | null
          created_at?: string
          dia: string
          followup_em?: string | null
          id?: string
          lead_id: string
          rifa_id: string
          saudado_em?: string
          tenant_id: string
        }
        Update: {
          conversa_id?: string | null
          created_at?: string
          dia?: string
          followup_em?: string | null
          id?: string
          lead_id?: string
          rifa_id?: string
          saudado_em?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rifa_bom_dia_envios_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifa_bom_dia_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifa_bom_dia_envios_rifa_id_fkey"
            columns: ["rifa_id"]
            isOneToOne: false
            referencedRelation: "rifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifa_bom_dia_envios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rifa_disparo_envios: {
        Row: {
          agendamento_id: string | null
          criado_em: string
          erro_detalhe: string | null
          id: string
          lista_disparo_id: string | null
          mensagem_enviada: string | null
          phone: string
          rifa_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          agendamento_id?: string | null
          criado_em?: string
          erro_detalhe?: string | null
          id?: string
          lista_disparo_id?: string | null
          mensagem_enviada?: string | null
          phone: string
          rifa_id: string
          status: string
          tenant_id: string
        }
        Update: {
          agendamento_id?: string | null
          criado_em?: string
          erro_detalhe?: string | null
          id?: string
          lista_disparo_id?: string | null
          mensagem_enviada?: string | null
          phone?: string
          rifa_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rifa_disparo_envios_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "rifa_agendamentos_disparo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifa_disparo_envios_lista_disparo_id_fkey"
            columns: ["lista_disparo_id"]
            isOneToOne: false
            referencedRelation: "rifa_lista_disparo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifa_disparo_envios_rifa_id_fkey"
            columns: ["rifa_id"]
            isOneToOne: false
            referencedRelation: "rifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifa_disparo_envios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rifa_dividas: {
        Row: {
          created_at: string
          id: string
          nome: string
          numero: number
          origem: string
          pago: boolean
          phone: string | null
          rifa_id: string
          sorteio_em: string
          tenant_id: string
          valor_centavos: number
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          numero: number
          origem?: string
          pago?: boolean
          phone?: string | null
          rifa_id: string
          sorteio_em?: string
          tenant_id: string
          valor_centavos: number
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          numero?: number
          origem?: string
          pago?: boolean
          phone?: string | null
          rifa_id?: string
          sorteio_em?: string
          tenant_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "rifa_dividas_rifa_id_fkey"
            columns: ["rifa_id"]
            isOneToOne: false
            referencedRelation: "rifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifa_dividas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rifa_imagens: {
        Row: {
          created_at: string
          deleted_at: string | null
          hora_sorteio: string | null
          id: string
          legenda: string | null
          nome_rifeiro: string | null
          premios: Json
          rifa_id: string
          tenant_id: string
          tipo: string
          url: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          hora_sorteio?: string | null
          id?: string
          legenda?: string | null
          nome_rifeiro?: string | null
          premios?: Json
          rifa_id: string
          tenant_id: string
          tipo?: string
          url: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          hora_sorteio?: string | null
          id?: string
          legenda?: string | null
          nome_rifeiro?: string | null
          premios?: Json
          rifa_id?: string
          tenant_id?: string
          tipo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "rifa_imagens_rifa_id_fkey"
            columns: ["rifa_id"]
            isOneToOne: false
            referencedRelation: "rifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifa_imagens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rifa_lista_disparo: {
        Row: {
          created_at: string
          id: string
          marcado: boolean
          nome: string | null
          origem: string
          phone: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marcado?: boolean
          nome?: string | null
          origem?: string
          phone: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marcado?: boolean
          nome?: string | null
          origem?: string
          phone?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rifa_lista_disparo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rifa_numeros_fixos: {
        Row: {
          created_at: string
          id: string
          metodo_sorteio: string
          nome: string
          numero: number
          phone: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metodo_sorteio: string
          nome: string
          numero: number
          phone?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metodo_sorteio?: string
          nome?: string
          numero?: number
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rifa_numeros_fixos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rifas: {
        Row: {
          aceita_fiado: boolean
          aviso_10min_em: string | null
          chave_publica: string
          cotas_premiadas: Json
          created_at: string
          data_sorteio_prevista: string | null
          deleted_at: string | null
          descricao: string | null
          galeria_urls: Json
          ganhador_nome: string | null
          ganhador_phone: string | null
          id: string
          imagem_url: string | null
          max_numeros_por_pedido: number
          metodo_sorteio: string
          minutos_reserva: number
          numeracao_desde_zero: boolean
          numero_sorteado: number | null
          preco_numero_centavos: number
          premio_principal: string
          premios_extras: Json
          promocoes: Json
          resultado_sorteio: Json | null
          sorteada_em: string | null
          status: string
          tenant_id: string
          titulo: string
          total_numeros: number
          updated_at: string
          vendidos_no_ultimo_status: number | null
        }
        Insert: {
          aceita_fiado?: boolean
          aviso_10min_em?: string | null
          chave_publica?: string
          cotas_premiadas?: Json
          created_at?: string
          data_sorteio_prevista?: string | null
          deleted_at?: string | null
          descricao?: string | null
          galeria_urls?: Json
          ganhador_nome?: string | null
          ganhador_phone?: string | null
          id?: string
          imagem_url?: string | null
          max_numeros_por_pedido?: number
          metodo_sorteio?: string
          minutos_reserva?: number
          numeracao_desde_zero?: boolean
          numero_sorteado?: number | null
          preco_numero_centavos: number
          premio_principal: string
          premios_extras?: Json
          promocoes?: Json
          resultado_sorteio?: Json | null
          sorteada_em?: string | null
          status?: string
          tenant_id: string
          titulo: string
          total_numeros: number
          updated_at?: string
          vendidos_no_ultimo_status?: number | null
        }
        Update: {
          aceita_fiado?: boolean
          aviso_10min_em?: string | null
          chave_publica?: string
          cotas_premiadas?: Json
          created_at?: string
          data_sorteio_prevista?: string | null
          deleted_at?: string | null
          descricao?: string | null
          galeria_urls?: Json
          ganhador_nome?: string | null
          ganhador_phone?: string | null
          id?: string
          imagem_url?: string | null
          max_numeros_por_pedido?: number
          metodo_sorteio?: string
          minutos_reserva?: number
          numeracao_desde_zero?: boolean
          numero_sorteado?: number | null
          preco_numero_centavos?: number
          premio_principal?: string
          premios_extras?: Json
          promocoes?: Json
          resultado_sorteio?: Json | null
          sorteada_em?: string | null
          status?: string
          tenant_id?: string
          titulo?: string
          total_numeros?: number
          updated_at?: string
          vendidos_no_ultimo_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rifas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rifas_config_tenant: {
        Row: {
          agente_pode_vender: boolean
          bom_dia_rifa_ativo: boolean
          chave_pix: string | null
          created_at: string
          postar_status_ativo: boolean
          rifa_disparo_id: string | null
          status_ultimo_post_em: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agente_pode_vender?: boolean
          bom_dia_rifa_ativo?: boolean
          chave_pix?: string | null
          created_at?: string
          postar_status_ativo?: boolean
          rifa_disparo_id?: string | null
          status_ultimo_post_em?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agente_pode_vender?: boolean
          bom_dia_rifa_ativo?: boolean
          chave_pix?: string | null
          created_at?: string
          postar_status_ativo?: boolean
          rifa_disparo_id?: string | null
          status_ultimo_post_em?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rifas_config_tenant_rifa_disparo_id_fkey"
            columns: ["rifa_disparo_id"]
            isOneToOne: false
            referencedRelation: "rifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rifas_config_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rollouts_canario: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          criterios_promocao: Json
          criterios_rollback: Json
          decidido_em: string | null
          decidido_por: string | null
          deleted_at: string | null
          descricao: string | null
          escopo: string
          filtros: Json
          finalizado_em: string | null
          id: string
          iniciado_em: string | null
          mudancas: Json
          nicho_id: string | null
          pct_trafego: number
          status: string
          tenant_id: string | null
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          criterios_promocao?: Json
          criterios_rollback?: Json
          decidido_em?: string | null
          decidido_por?: string | null
          deleted_at?: string | null
          descricao?: string | null
          escopo?: string
          filtros?: Json
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          mudancas?: Json
          nicho_id?: string | null
          pct_trafego?: number
          status?: string
          tenant_id?: string | null
          titulo: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          criterios_promocao?: Json
          criterios_rollback?: Json
          decidido_em?: string | null
          decidido_por?: string | null
          deleted_at?: string | null
          descricao?: string | null
          escopo?: string
          filtros?: Json
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          mudancas?: Json
          nicho_id?: string | null
          pct_trafego?: number
          status?: string
          tenant_id?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "canary_rollouts_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canary_rollouts_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canary_rollouts_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canary_rollouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      salas_reuniao: {
        Row: {
          agendada_para: string | null
          analisada_em: string | null
          assunto: string | null
          chave_publica: string
          created_at: string
          criada_por: string
          deleted_at: string | null
          duracao_min: number | null
          encerrada_em: string | null
          exige_aprovacao: boolean
          id: string
          iniciada_em: string | null
          max_participantes: number
          modo: string
          resumo: string | null
          status: string
          tenant_id: string
          titulo: string
          topicos: Json | null
          transporte: string
          updated_at: string
        }
        Insert: {
          agendada_para?: string | null
          analisada_em?: string | null
          assunto?: string | null
          chave_publica?: string
          created_at?: string
          criada_por: string
          deleted_at?: string | null
          duracao_min?: number | null
          encerrada_em?: string | null
          exige_aprovacao?: boolean
          id?: string
          iniciada_em?: string | null
          max_participantes?: number
          modo?: string
          resumo?: string | null
          status?: string
          tenant_id: string
          titulo?: string
          topicos?: Json | null
          transporte?: string
          updated_at?: string
        }
        Update: {
          agendada_para?: string | null
          analisada_em?: string | null
          assunto?: string | null
          chave_publica?: string
          created_at?: string
          criada_por?: string
          deleted_at?: string | null
          duracao_min?: number | null
          encerrada_em?: string | null
          exige_aprovacao?: boolean
          id?: string
          iniciada_em?: string | null
          max_participantes?: number
          modo?: string
          resumo?: string | null
          status?: string
          tenant_id?: string
          titulo?: string
          topicos?: Json | null
          transporte?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salas_reuniao_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salas_reuniao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      salas_reuniao_dossie: {
        Row: {
          atualizado_em: string
          created_at: string
          dados: Json
          deleted_at: string | null
          id: string
          nome: string
          peer_id: string
          sala_id: string
          tenant_id: string
        }
        Insert: {
          atualizado_em?: string
          created_at?: string
          dados?: Json
          deleted_at?: string | null
          id?: string
          nome?: string
          peer_id: string
          sala_id: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          created_at?: string
          dados?: Json
          deleted_at?: string | null
          id?: string
          nome?: string
          peer_id?: string
          sala_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salas_reuniao_dossie_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas_reuniao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salas_reuniao_dossie_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      salas_reuniao_participantes: {
        Row: {
          entrou_em: string
          id: string
          nome_convidado: string | null
          papel: string
          saiu_em: string | null
          sala_id: string
          status_entrada: string
          user_id: string | null
        }
        Insert: {
          entrou_em?: string
          id?: string
          nome_convidado?: string | null
          papel?: string
          saiu_em?: string | null
          sala_id: string
          status_entrada?: string
          user_id?: string | null
        }
        Update: {
          entrou_em?: string
          id?: string
          nome_convidado?: string | null
          papel?: string
          saiu_em?: string | null
          sala_id?: string
          status_entrada?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salas_reuniao_participantes_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas_reuniao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salas_reuniao_participantes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      salas_reuniao_turnos: {
        Row: {
          created_at: string
          deleted_at: string | null
          do_time: boolean
          falado_em: string
          id: string
          nome: string
          peer_id: string
          sala_id: string
          tenant_id: string
          texto: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          do_time?: boolean
          falado_em?: string
          id?: string
          nome?: string
          peer_id: string
          sala_id: string
          tenant_id: string
          texto: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          do_time?: boolean
          falado_em?: string
          id?: string
          nome?: string
          peer_id?: string
          sala_id?: string
          tenant_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "salas_reuniao_turnos_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas_reuniao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salas_reuniao_turnos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      servicos_publicos: {
        Row: {
          created_at: string
          descricao: string | null
          foto_url: string | null
          id: string
          nome: string
          ordem: number
          preco_text: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          foto_url?: string | null
          id?: string
          nome: string
          ordem?: number
          preco_text?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
          ordem?: number
          preco_text?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sessoes_chat_publico: {
        Row: {
          chave_sessao: string
          conversation_id: string | null
          created_at: string
          id: string
          ip_hash: string | null
          last_activity_at: string
          lead_id: string | null
          user_agent: string | null
          user_id: string
          visitor_email: string | null
          visitor_name: string | null
          visitor_phone: string | null
        }
        Insert: {
          chave_sessao?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          last_activity_at?: string
          lead_id?: string | null
          user_agent?: string | null
          user_id: string
          visitor_email?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
        }
        Update: {
          chave_sessao?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          last_activity_at?: string
          lead_id?: string | null
          user_agent?: string | null
          user_id?: string
          visitor_email?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_chat_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_chat_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      socios: {
        Row: {
          created_at: string | null
          descricao: string | null
          empresa_id: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          empresa_id: string
          id?: string
          nome?: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "socios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      sons_notificacao: {
        Row: {
          arquivo: string
          ativo: boolean
          criado_em: string
          descricao: string
          duracao_s: number
          estilo: string
          id: string
          nome: string
          ordem: number
          tamanho_kb: number
        }
        Insert: {
          arquivo: string
          ativo?: boolean
          criado_em?: string
          descricao: string
          duracao_s: number
          estilo: string
          id: string
          nome: string
          ordem?: number
          tamanho_kb: number
        }
        Update: {
          arquivo?: string
          ativo?: boolean
          criado_em?: string
          descricao?: string
          duracao_s?: number
          estilo?: string
          id?: string
          nome?: string
          ordem?: number
          tamanho_kb?: number
        }
        Relationships: []
      }
      sotaques_candidatos: {
        Row: {
          exemplos: string[] | null
          id: string
          marcador: string
          ocorrencias: number
          primeira_em: string
          regiao_palpite: string | null
          status: string
          ultima_em: string
        }
        Insert: {
          exemplos?: string[] | null
          id?: string
          marcador: string
          ocorrencias?: number
          primeira_em?: string
          regiao_palpite?: string | null
          status?: string
          ultima_em?: string
        }
        Update: {
          exemplos?: string[] | null
          id?: string
          marcador?: string
          ocorrencias?: number
          primeira_em?: string
          regiao_palpite?: string | null
          status?: string
          ultima_em?: string
        }
        Relationships: []
      }
      sotaques_catalogo: {
        Row: {
          ativo: boolean
          created_at: string
          curado_por: string | null
          exemplos: string[] | null
          fonte: string | null
          id: string
          marcador: string
          marcador_norm: string | null
          regiao: string
          uf: string | null
          updated_at: string
          validado_em: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          curado_por?: string | null
          exemplos?: string[] | null
          fonte?: string | null
          id?: string
          marcador: string
          marcador_norm?: string | null
          regiao: string
          uf?: string | null
          updated_at?: string
          validado_em?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          curado_por?: string | null
          exemplos?: string[] | null
          fonte?: string | null
          id?: string
          marcador?: string
          marcador_norm?: string | null
          regiao?: string
          uf?: string | null
          updated_at?: string
          validado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sotaques_catalogo_curado_por_fkey"
            columns: ["curado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sotaques_observados: {
        Row: {
          confianca: number
          criado_em: string
          fonte_msg: string | null
          id: string
          lead_id: string
          marcadores: string[]
          motivo_validacao: string | null
          regiao_inferida: string | null
          status: string
          tenant_id: string
          trecho_amostra: string | null
          uf_inferida: string | null
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          confianca?: number
          criado_em?: string
          fonte_msg?: string | null
          id?: string
          lead_id: string
          marcadores: string[]
          motivo_validacao?: string | null
          regiao_inferida?: string | null
          status?: string
          tenant_id: string
          trecho_amostra?: string | null
          uf_inferida?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          confianca?: number
          criado_em?: string
          fonte_msg?: string | null
          id?: string
          lead_id?: string
          marcadores?: string[]
          motivo_validacao?: string | null
          regiao_inferida?: string | null
          status?: string
          tenant_id?: string
          trecho_amostra?: string | null
          uf_inferida?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sotaques_observados_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sotaques_observados_validado_por_fkey"
            columns: ["validado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sugestoes_fusao_tag: {
        Row: {
          criado_em: string
          decided_at: string | null
          decided_by: string | null
          id: string
          motivo: string | null
          nicho_id: string | null
          similarity: number
          status: string
          suggested_canonical: string
          tag_a: string | null
          tag_b: string | null
          tags: string[]
          tenant_id: string | null
        }
        Insert: {
          criado_em?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          motivo?: string | null
          nicho_id?: string | null
          similarity: number
          status?: string
          suggested_canonical: string
          tag_a?: string | null
          tag_b?: string | null
          tags?: string[]
          tenant_id?: string | null
        }
        Update: {
          criado_em?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          motivo?: string | null
          nicho_id?: string | null
          similarity?: number
          status?: string
          suggested_canonical?: string
          tag_a?: string | null
          tag_b?: string | null
          tags?: string[]
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sugestoes_fusao_tag_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestoes_fusao_tag_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestoes_fusao_tag_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tabelas_consulta_permitidas: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string
          permite_escrita: boolean
          permite_exclusao: boolean
          tabela: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao?: string
          permite_escrita?: boolean
          permite_exclusao?: boolean
          tabela: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string
          permite_escrita?: boolean
          permite_exclusao?: boolean
          tabela?: string
        }
        Relationships: []
      }
      tags_vocabulario: {
        Row: {
          agente_id: string | null
          chave: string
          criado_em: string
          id: string
          owner_id: string | null
          valor: string
        }
        Insert: {
          agente_id?: string | null
          chave: string
          criado_em?: string
          id?: string
          owner_id?: string | null
          valor: string
        }
        Update: {
          agente_id?: string | null
          chave?: string
          criado_em?: string
          id?: string
          owner_id?: string | null
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_vocabulario_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_vocabulario_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_vocabulario_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      testes_ab_blocos: {
        Row: {
          bloco_a_id: string | null
          bloco_b_id: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          metrica: string
          resultado: Json | null
        }
        Insert: {
          bloco_a_id?: string | null
          bloco_b_id?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          metrica: string
          resultado?: Json | null
        }
        Update: {
          bloco_a_id?: string | null
          bloco_b_id?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          metrica?: string
          resultado?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "testes_ab_blocos_bloco_a_id_fkey"
            columns: ["bloco_a_id"]
            isOneToOne: false
            referencedRelation: "blocos_conhecimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testes_ab_blocos_bloco_b_id_fkey"
            columns: ["bloco_b_id"]
            isOneToOne: false
            referencedRelation: "blocos_conhecimento"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_conversa: {
        Row: {
          campaign_lead_id: string | null
          ciclo_bucket: number
          conversation_id: string
          created_at: string
          id: string
          origem: string
          tenant_id: string
        }
        Insert: {
          campaign_lead_id?: string | null
          ciclo_bucket: number
          conversation_id: string
          created_at?: string
          id?: string
          origem: string
          tenant_id: string
        }
        Update: {
          campaign_lead_id?: string | null
          ciclo_bucket?: number
          conversation_id?: string
          created_at?: string
          id?: string
          origem?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tickets_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "leads_campanha"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_de_produto: {
        Row: {
          ativo: boolean
          categorias: string[] | null
          criado_em: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          ativo?: boolean
          categorias?: string[] | null
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          ativo?: boolean
          categorias?: string[] | null
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      tools_do_agente: {
        Row: {
          agente_id: string
          ativo: boolean
          criado_em: string
          descricao: string | null
          endpoint_url: string | null
          id: string
          nome: string
          schema_zod: Json
        }
        Insert: {
          agente_id: string
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          endpoint_url?: string | null
          id?: string
          nome: string
          schema_zod?: Json
        }
        Update: {
          agente_id?: string
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          endpoint_url?: string | null
          id?: string
          nome?: string
          schema_zod?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tools_do_agente_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_do_agente_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      traces: {
        Row: {
          agente_id: string | null
          cargo_id: string | null
          confianca: number | null
          conversa_id: string | null
          criado_em: string
          custo_tokens_in: number | null
          custo_tokens_out: number | null
          decisao: Json | null
          id: string
          latencia_ms: number | null
          lead_id: string | null
          modelo_llm: string | null
          prompt_resumo: string | null
          raciocinio_interno: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["trace_tipo"]
          turno_id: string | null
        }
        Insert: {
          agente_id?: string | null
          cargo_id?: string | null
          confianca?: number | null
          conversa_id?: string | null
          criado_em?: string
          custo_tokens_in?: number | null
          custo_tokens_out?: number | null
          decisao?: Json | null
          id?: string
          latencia_ms?: number | null
          lead_id?: string | null
          modelo_llm?: string | null
          prompt_resumo?: string | null
          raciocinio_interno?: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["trace_tipo"]
          turno_id?: string | null
        }
        Update: {
          agente_id?: string | null
          cargo_id?: string | null
          confianca?: number | null
          conversa_id?: string | null
          criado_em?: string
          custo_tokens_in?: number | null
          custo_tokens_out?: number | null
          decisao?: Json | null
          id?: string
          latencia_ms?: number | null
          lead_id?: string | null
          modelo_llm?: string | null
          prompt_resumo?: string | null
          raciocinio_interno?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["trace_tipo"]
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traces_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traces_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traces_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
      traces_do_turno: {
        Row: {
          carga: Json
          conversa_id: string | null
          criado_em: string
          id: string
          tipo: string
        }
        Insert: {
          carga?: Json
          conversa_id?: string | null
          criado_em?: string
          id?: string
          tipo: string
        }
        Update: {
          carga?: Json
          conversa_id?: string | null
          criado_em?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "traces_do_turno_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      travas_conversa: {
        Row: {
          conversation_id: string
          expires_at: string | null
          locked_at: string | null
        }
        Insert: {
          conversation_id: string
          expires_at?: string | null
          locked_at?: string | null
        }
        Update: {
          conversation_id?: string
          expires_at?: string | null
          locked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_locks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      tutoriais: {
        Row: {
          created_at: string | null
          id: string
          sort_order: number | null
          title: string
          youtube_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          sort_order?: number | null
          title: string
          youtube_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          sort_order?: number | null
          title?: string
          youtube_url?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          criado_em: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      valores_ficha: {
        Row: {
          campo_id: string
          id: string
          lead_id: string
          real_world_valid_from: string | null
          real_world_valid_to: string | null
          recorded_at: string
          recorded_by: string
          substituido_por_id: string | null
          tenant_id: string
          valid_from: string
          valid_to: string | null
          valor: Json
          valor_texto: string | null
        }
        Insert: {
          campo_id: string
          id?: string
          lead_id: string
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          recorded_at?: string
          recorded_by?: string
          substituido_por_id?: string | null
          tenant_id: string
          valid_from?: string
          valid_to?: string | null
          valor: Json
          valor_texto?: string | null
        }
        Update: {
          campo_id?: string
          id?: string
          lead_id?: string
          real_world_valid_from?: string | null
          real_world_valid_to?: string | null
          recorded_at?: string
          recorded_by?: string
          substituido_por_id?: string | null
          tenant_id?: string
          valid_from?: string
          valid_to?: string | null
          valor?: Json
          valor_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ficha_form_valores_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campos_ficha"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_form_valores_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_form_valores_substituido_por_id_fkey"
            columns: ["substituido_por_id"]
            isOneToOne: false
            referencedRelation: "valores_ficha"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabulario_curadoria: {
        Row: {
          ativo: boolean
          atualizado_em: string
          chave: string | null
          contexto: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          escopo: string
          id: string
          multivalor: boolean
          nicho_id: string | null
          rotulo: string | null
          tenant_id: string | null
          tipo: string
          validacao_regex: string | null
          valor: string
          vezes_usado: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          chave?: string | null
          contexto: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          escopo?: string
          id?: string
          multivalor?: boolean
          nicho_id?: string | null
          rotulo?: string | null
          tenant_id?: string | null
          tipo?: string
          validacao_regex?: string | null
          valor: string
          vezes_usado?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          chave?: string | null
          contexto?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          escopo?: string
          id?: string
          multivalor?: boolean
          nicho_id?: string | null
          rotulo?: string | null
          tenant_id?: string | null
          tipo?: string
          validacao_regex?: string | null
          valor?: string
          vezes_usado?: number
        }
        Relationships: [
          {
            foreignKeyName: "vocabulario_curadoria_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "nichos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agentes_usuario: {
        Row: {
          calibragem_recall: Json | null
          configuracao: Json | null
          created_at: string | null
          fluxo: Json | null
          id: string | null
          identidade: Json | null
          is_active: boolean | null
          max_tokens: number | null
          modelo_principal: string | null
          nome_agente: string | null
          product_flows: Json | null
          temperatura: number | null
          tom_agente: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          calibragem_recall?: Json | null
          configuracao?: Json | null
          created_at?: string | null
          fluxo?: Json | null
          id?: string | null
          identidade?: Json | null
          is_active?: boolean | null
          max_tokens?: number | null
          modelo_principal?: string | null
          nome_agente?: string | null
          product_flows?: Json | null
          temperatura?: number | null
          tom_agente?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          calibragem_recall?: Json | null
          configuracao?: Json | null
          created_at?: string | null
          fluxo?: Json | null
          id?: string | null
          identidade?: Json | null
          is_active?: boolean | null
          max_tokens?: number | null
          modelo_principal?: string | null
          nome_agente?: string | null
          product_flows?: Json | null
          temperatura?: number | null
          tom_agente?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compromissos_ativos: {
        Row: {
          agente_id: string | null
          carga: Json | null
          conversa_id: string | null
          created_at: string | null
          executar_em: string | null
          id: string | null
          lead_id: string | null
          origem: string | null
          origem_tabela: string | null
          status: string | null
          tenant_id: string | null
          tipo: string | null
          titulo: string | null
        }
        Relationships: []
      }
      config_contrato_legacy_en: {
        Row: {
          company_description: string | null
          company_name: string | null
          created_at: string | null
          default_num_testemunhas: number | null
          default_required_fields: string[] | null
          default_selfie_instruction: string | null
          id: string | null
          logo_url: string | null
          page_color: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_description?: string | null
          company_name?: string | null
          created_at?: string | null
          default_num_testemunhas?: number | null
          default_required_fields?: string[] | null
          default_selfie_instruction?: string | null
          id?: string | null
          logo_url?: string | null
          page_color?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_description?: string | null
          company_name?: string | null
          created_at?: string | null
          default_num_testemunhas?: number | null
          default_required_fields?: string[] | null
          default_selfie_instruction?: string | null
          id?: string | null
          logo_url?: string | null
          page_color?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_contrato_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config_plataforma_publico: {
        Row: {
          description: string | null
          domain: string | null
          id: string | null
          logo_url: string | null
          pix_key: string | null
          primary_color: string | null
          support_email: string | null
          system_name: string | null
          termos_uso: string | null
          termos_uso_ativo: boolean | null
        }
        Insert: {
          description?: string | null
          domain?: string | null
          id?: string | null
          logo_url?: string | null
          pix_key?: string | null
          primary_color?: string | null
          support_email?: string | null
          system_name?: string | null
          termos_uso?: string | null
          termos_uso_ativo?: boolean | null
        }
        Update: {
          description?: string | null
          domain?: string | null
          id?: string | null
          logo_url?: string | null
          pix_key?: string | null
          primary_color?: string | null
          support_email?: string | null
          system_name?: string | null
          termos_uso?: string | null
          termos_uso_ativo?: boolean | null
        }
        Relationships: []
      }
      contratos_legacy_en: {
        Row: {
          agente_id: string | null
          chave_publica: string | null
          client_data: Json | null
          client_fields: string[] | null
          company_description: string | null
          company_name: string | null
          contract_hash: string | null
          contract_text: string | null
          conversation_id: string | null
          created_at: string | null
          document_url: string | null
          id: string | null
          installment_link: string | null
          lead_id: string | null
          logo_url: string | null
          num_testemunhas: number | null
          origem: string | null
          page_color: string | null
          payment_details: Json | null
          payment_method: string | null
          payment_options: Json | null
          payment_position: string | null
          payment_proof_url: string | null
          pdf_url: string | null
          pix_key: string | null
          required_fields: Json | null
          selfie_instruction: string | null
          selfie_url: string | null
          signature_ip: string | null
          signature_url: string | null
          signed_at: string | null
          signer_data: Json | null
          status: string | null
          template_name: string | null
          tenant_id: string | null
          title: string | null
          witness_data: Json | null
          witness_document_url: string | null
          witness_ip: string | null
          witness_selfie_url: string | null
          witness_signature_url: string | null
          witness_signed_at: string | null
        }
        Insert: {
          agente_id?: string | null
          chave_publica?: string | null
          client_data?: Json | null
          client_fields?: string[] | null
          company_description?: string | null
          company_name?: string | null
          contract_hash?: string | null
          contract_text?: string | null
          conversation_id?: string | null
          created_at?: string | null
          document_url?: string | null
          id?: string | null
          installment_link?: string | null
          lead_id?: string | null
          logo_url?: string | null
          num_testemunhas?: number | null
          origem?: string | null
          page_color?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          payment_options?: Json | null
          payment_position?: string | null
          payment_proof_url?: string | null
          pdf_url?: string | null
          pix_key?: string | null
          required_fields?: Json | null
          selfie_instruction?: string | null
          selfie_url?: string | null
          signature_ip?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signer_data?: Json | null
          status?: string | null
          template_name?: string | null
          tenant_id?: string | null
          title?: string | null
          witness_data?: Json | null
          witness_document_url?: string | null
          witness_ip?: string | null
          witness_selfie_url?: string | null
          witness_signature_url?: string | null
          witness_signed_at?: string | null
        }
        Update: {
          agente_id?: string | null
          chave_publica?: string | null
          client_data?: Json | null
          client_fields?: string[] | null
          company_description?: string | null
          company_name?: string | null
          contract_hash?: string | null
          contract_text?: string | null
          conversation_id?: string | null
          created_at?: string | null
          document_url?: string | null
          id?: string | null
          installment_link?: string | null
          lead_id?: string | null
          logo_url?: string | null
          num_testemunhas?: number | null
          origem?: string | null
          page_color?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          payment_options?: Json | null
          payment_position?: string | null
          payment_proof_url?: string | null
          pdf_url?: string | null
          pix_key?: string | null
          required_fields?: Json | null
          selfie_instruction?: string | null
          selfie_url?: string | null
          signature_ip?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signer_data?: Json | null
          status?: string | null
          template_name?: string | null
          tenant_id?: string | null
          title?: string | null
          witness_data?: Json | null
          witness_document_url?: string | null
          witness_ip?: string | null
          witness_selfie_url?: string | null
          witness_signature_url?: string | null
          witness_signed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_conversa_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_template_legacy_en: {
        Row: {
          ativo: boolean | null
          blocos: Json | null
          conteudo: string | null
          created_at: string | null
          id: string | null
          installment_link: string | null
          installment_options: Json | null
          nome: string | null
          num_testemunhas: number | null
          payment_position: string | null
          pix_key: string | null
          placeholders: Json | null
          produto_id: string | null
          required_fields: string[] | null
          selfie_instruction: string | null
          updated_at: string | null
          user_id: string | null
          valor_a_vista: number | null
        }
        Insert: {
          ativo?: boolean | null
          blocos?: Json | null
          conteudo?: string | null
          created_at?: string | null
          id?: string | null
          installment_link?: string | null
          installment_options?: Json | null
          nome?: string | null
          num_testemunhas?: number | null
          payment_position?: string | null
          pix_key?: string | null
          placeholders?: Json | null
          produto_id?: string | null
          required_fields?: string[] | null
          selfie_instruction?: string | null
          updated_at?: string | null
          user_id?: string | null
          valor_a_vista?: number | null
        }
        Update: {
          ativo?: boolean | null
          blocos?: Json | null
          conteudo?: string | null
          created_at?: string | null
          id?: string | null
          installment_link?: string | null
          installment_options?: Json | null
          nome?: string | null
          num_testemunhas?: number | null
          payment_position?: string | null
          pix_key?: string | null
          placeholders?: Json | null
          produto_id?: string | null
          required_fields?: string[] | null
          selfie_instruction?: string | null
          updated_at?: string | null
          user_id?: string | null
          valor_a_vista?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_template_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      crenca_conversa: {
        Row: {
          belief: Json | null
          belief_historico: Json | null
          conversation_id: string | null
          created_at: string | null
          estilo_lead: string | null
          id: string | null
          origem_planejamento: string | null
          proxima_intencao: Json | null
          proximo_passo_previsto: string | null
          resumo_agente: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          belief?: Json | null
          belief_historico?: Json | null
          conversation_id?: string | null
          created_at?: string | null
          estilo_lead?: string | null
          id?: string | null
          origem_planejamento?: string | null
          proxima_intencao?: Json | null
          proximo_passo_previsto?: string | null
          resumo_agente?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          belief?: Json | null
          belief_historico?: Json | null
          conversation_id?: string | null
          created_at?: string | null
          estilo_lead?: string | null
          id?: string | null
          origem_planejamento?: string | null
          proxima_intencao?: Json | null
          proximo_passo_previsto?: string | null
          resumo_agente?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crenca_conversa_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_cliente_legacy_en: {
        Row: {
          created_at: string | null
          file_name: string | null
          file_path: string | null
          file_size: string | null
          file_type: string | null
          id: string | null
          label: string | null
          lead_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: string | null
          file_type?: string | null
          id?: string | null
          label?: string | null
          lead_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: string | null
          file_type?: string | null
          id?: string | null
          label?: string | null
          lead_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_cliente_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      log_acesso_contrato_legacy_en: {
        Row: {
          chave_publica: string | null
          created_at: string | null
          event: string | null
          id: string | null
          ip: string | null
          meta: Json | null
          user_agent: string | null
        }
        Insert: {
          chave_publica?: string | null
          created_at?: string | null
          event?: string | null
          id?: string | null
          ip?: string | null
          meta?: Json | null
          user_agent?: string | null
        }
        Update: {
          chave_publica?: string | null
          created_at?: string | null
          event?: string | null
          id?: string | null
          ip?: string | null
          meta?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      pagamentos_cliente_legacy_en: {
        Row: {
          comprovante_rejected_motivo: string | null
          contract_id: string | null
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          id: string | null
          lead_id: string | null
          metodo_pagamento: string | null
          observacao: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          comprovante_rejected_motivo?: string | null
          contract_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string | null
          lead_id?: string | null
          metodo_pagamento?: string | null
          observacao?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          comprovante_rejected_motivo?: string | null
          contract_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string | null
          lead_id?: string | null
          metodo_pagamento?: string | null
          observacao?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_cliente_contrato_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_cliente_contrato_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contratos_legacy_en"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_cliente_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_cliente_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_gargalos_campanha_tenant: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          fase: string | null
          horas_medias_na_fase: number | null
          leads_na_fase: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_leads_por_fase_tenant: {
        Row: {
          fase: string | null
          tenant_id: string | null
          total: number | null
          ultimos_7d: number | null
        }
        Relationships: []
      }
      vw_cerebro_kpis_1h: {
        Row: {
          calculado_em: string | null
          custo_hora_usd: number | null
          latencia_p50_ms: number | null
          latencia_p95_ms: number | null
          turnos_hora: number | null
        }
        Relationships: []
      }
      vw_cerebro_turnos_recentes: {
        Row: {
          cargo_nome: string | null
          confianca: number | null
          criado_em: string | null
          custo_tokens_in: number | null
          custo_tokens_out: number | null
          custo_usd_estimado: number | null
          id: string | null
          latencia_ms: number | null
          lead_id: string | null
          lead_nome: string | null
          modelo_llm: string | null
          tenant_id: string | null
          tipo: string | null
        }
        Relationships: []
      }
      vw_cron_saude: {
        Row: {
          active: boolean | null
          duracao_media_ms: number | null
          falhas_7d: number | null
          jobid: number | null
          jobname: string | null
          schedule: string | null
          status_ultima: string | null
          sucessos_7d: number | null
          ultima_exec: string | null
        }
        Relationships: []
      }
      vw_dashboard_curadoria: {
        Row: {
          calculado_em: string | null
          chamadas_total: number | null
          conversas_24h: number | null
          conversas_30d: number | null
          conversas_7d: number | null
          custo_total_usd: number | null
          leads_ativos: number | null
          leads_convertidos: number | null
          leads_recusados: number | null
          leads_sumidos: number | null
          leads_total: number | null
          msgs_agente: number | null
          msgs_humano: number | null
          msgs_por_humano: number | null
          taxa_conversao_global: number | null
        }
        Relationships: []
      }
      vw_dashboard_serie_30d: {
        Row: {
          conversas: number | null
          dia: string | null
        }
        Relationships: []
      }
      vw_dashboard_top_gavetas: {
        Row: {
          acionamentos: number | null
          gaveta: string | null
        }
        Relationships: []
      }
      vw_gatilhos_reativos: {
        Row: {
          acao_carga: Json | null
          acao_tipo: string | null
          ativo: boolean | null
          cargo_id: string | null
          cenario: string | null
          criado_em: string | null
          escopo: string | null
          exemplo_frase: string | null
          id: string | null
          nicho_id: string | null
          origem: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
      vw_heatmap_humor_7d: {
        Row: {
          dia_semana: number | null
          hora: number | null
          qtd: number | null
          valencia_media: number | null
        }
        Relationships: []
      }
      vw_metricas_ferramentas_dia: {
        Row: {
          dia: string | null
          falhas: number | null
          ferramenta_nome: string | null
          sucessos: number | null
          tenant_id: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_invocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_metricas_motor_dia: {
        Row: {
          dia: string | null
          latencia_media_ms: number | null
          modelo_llm: string | null
          p95_latencia_ms: number | null
          tenant_id: string | null
          tipo: Database["public"]["Enums"]["trace_tipo"] | null
          tokens_in: number | null
          tokens_out: number | null
          total_eventos: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _cronjob_montar_command: {
        Args: { p_edge_function: string; p_parametros: Json }
        Returns: string
      }
      _eh_platform_admin: { Args: never; Returns: boolean }
      _lead_pertence_caller: { Args: { p_lead_id: string }; Returns: boolean }
      abrir_objetivo_pilha: {
        Args: {
          p_contexto?: string
          p_conversa_id: string
          p_lead_id?: string
          p_objetivo: string
          p_origem?: string
          p_prioridade?: number
          p_tenant_id: string
        }
        Returns: string
      }
      admin_agregar: {
        Args: {
          p_filtros?: Json
          p_group_by?: string[]
          p_limite?: number
          p_metricas?: Json
          p_tabela: string
        }
        Returns: Json
      }
      admin_descrever_tabela: { Args: { p_tabela: string }; Returns: Json }
      admin_excluir_usuarios: { Args: { p_user_ids: string[] }; Returns: Json }
      admin_query_sql: {
        Args: { p_limite?: number; p_query: string }
        Returns: Json
      }
      adquirir_trava_motor: {
        Args: { p_conversation_id: string; p_ttl_segundos?: number }
        Returns: boolean
      }
      agendar_reuniao: {
        Args: {
          p_agendada_para: string
          p_duracao_min?: number
          p_exige_aprovacao?: boolean
          p_max?: number
          p_titulo: string
        }
        Returns: Json
      }
      agendar_reuniao_lead: {
        Args: {
          p_agente_id: string
          p_conversa_id: string
          p_inicio: string
          p_lead_id: string
          p_tenant_id: string
          p_titulo?: string
        }
        Returns: Json
      }
      agregar_comparativo_nicho: { Args: never; Returns: number }
      alternar_check_nota: {
        Args: { p_check_id: string; p_marcado: boolean; p_nota_id: string }
        Returns: undefined
      }
      alternar_checkpoint_publico: {
        Args: { p_checkpoint_id: string; p_token: string; p_value: boolean }
        Returns: undefined
      }
      amostragem_estratificada: {
        Args: {
          p_dias?: number
          p_max_conversas?: number
          p_tenant_id?: string
        }
        Returns: Json
      }
      analisar_causa_efeito_tenant: {
        Args: { p_tenant_id: string }
        Returns: {
          diferenca_pp: number
          ferramenta_ou_cargo: string
          metrica: string
          n_amostras: number
          taxa_conversao_geral: number
          taxa_conversao_quando_usada: number
        }[]
      }
      aplicar_fusao_tag: {
        Args: { p_canonical?: string; p_suggestion_id: string }
        Returns: number
      }
      aplicar_vetores_lote: {
        Args: { p_ids: string[]; p_tabela: string; p_vetores: string[] }
        Returns: number
      }
      apps_visiveis_para_tenant: {
        Args: never
        Returns: {
          categoria: string
          created_at: string
          descricao: string
          icone: string
          id: string
          is_active: boolean
          nome: string
          ordem: number
          preco_mensal: number | null
          slug: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "loja_aplicativos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      aprovar_depoimento_para_rag: {
        Args: { p_admin_id: string; p_testimonial_id: string }
        Returns: string
      }
      aprovar_recarga: { Args: { p_recarga_id: string }; Returns: Json }
      aprovar_trecho_conversa_para_rag: {
        Args: {
          p_admin_id: string
          p_categoria: string
          p_chunk_candidate_id?: string
          p_conversation_id: string
          p_message_ids: string[]
          p_tenant_id: string
          p_tipo: string
        }
        Returns: string
      }
      arquivar_desistentes: {
        Args: { p_campaign_lead_ids: string[] }
        Returns: number
      }
      assinar_contrato_publico: {
        Args: { p_payload: Json; p_token: string }
        Returns: string
      }
      ativar_recurso_curadoria: { Args: { p_chave: string }; Returns: Json }
      atualizar_cache_conversas_usadas: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      atualizar_dados_escrita: {
        Args: { p_confirmar_em_massa?: boolean; p_owner: string; p_sql: string }
        Returns: Json
      }
      atualizar_dados_escrita_nucleo: {
        Args: { p_confirmar_em_massa?: boolean; p_owner: string; p_sql: string }
        Returns: Json
      }
      atualizar_em_massa_leads_campanha: {
        Args: {
          p_acao: string
          p_campaign_id: string
          p_lead_ids: string[]
          p_tenant_id: string
        }
        Returns: number
      }
      avaliar_criterio_segmento: {
        Args: { p_criterio: Json; p_tags: string[] }
        Returns: boolean
      }
      blocos_atuais_tenant: {
        Args: { p_gaveta: string; p_tenant_id: string }
        Returns: Json
      }
      bufferar_mensagem_entrante: {
        Args: {
          p_agent_id: string
          p_channel_id: string
          p_media_type?: string
          p_media_url?: string
          p_phone: string
          p_text: string
        }
        Returns: Json
      }
      busca_hibrida_acao_pausa: {
        Args: {
          p_full_text_weight?: number
          p_match_count?: number
          p_nicho_id?: string
          p_query: string
          p_query_embedding: unknown
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tenant_id: string
        }
        Returns: {
          duracao_min: number
          escopo: string
          gatilho_descricao: string
          gatilho_falas: Json
          id: string
          mensagem_retorno: string
          prioridade: number
          rrf_score: number
          similarity: number
        }[]
      }
      busca_hibrida_agente_identidade: {
        Args: {
          p_agente_id: string
          p_fts_weight?: number
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_sem_weight?: number
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          dimensao: string
          id: string
          intensidade: number
          raciocinio: string
          score: number
          texto: string
        }[]
      }
      busca_hibrida_anti_padroes: {
        Args: {
          p_fts_weight?: number
          p_nicho_id: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_sem_weight?: number
          p_tenant_id: string
          p_threshold?: number
          p_tipo_campanha?: string
          p_top_k?: number
        }
        Returns: {
          acao_correta: string
          escopo: string
          id: string
          por_que: string
          score: number
          situacao: string
        }[]
      }
      busca_hibrida_comportamento: {
        Args: {
          p_full_text_weight?: number
          p_match_count?: number
          p_nicho_id?: string
          p_produto_id?: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tenant_id?: string
          p_tom?: string
        }
        Returns: {
          escopo: string
          id: string
          instrucao: string
          prioridade: number
          rrf_score: number
          situacao_descricao: string
          tags: string[]
        }[]
      }
      busca_hibrida_conhecimento: {
        Args: {
          p_agent_id?: string
          p_category?: string
          p_full_text_weight?: number
          p_match_count?: number
          p_nicho_id?: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tipo?: string
          p_tom?: string
        }
        Returns: {
          agent_id: string
          category: string
          content: string
          escopo: string
          id: string
          rrf_score: number
          tags: string[]
          tipo: string
          title: string
        }[]
      }
      busca_hibrida_diretriz_bolha: {
        Args: {
          p_fts_weight?: number
          p_nicho_id: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_sem_weight?: number
          p_tenant_id: string
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          chars_medio_sugerido: number
          contexto: string
          id: string
          motivo: string
          quantidade_sugerida: string
          score: number
        }[]
      }
      busca_hibrida_emocao: {
        Args: {
          p_intensidade_min?: number
          p_nicho_id?: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_tenant_id?: string
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          corpo: string
          emocao: string
          escopo: string
          id: string
          intensidade_match: number
          prioridade: number
          score: number
        }[]
      }
      busca_hibrida_emocao_blocos: {
        Args: {
          p_fts_weight?: number
          p_nicho_id: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_sem_weight?: number
          p_tenant_id: string
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          corpo: string
          emocao: string
          escopo: string
          exemplos: Json
          id: string
          intensidade_match: number
          score: number
        }[]
      }
      busca_hibrida_fase_requisitos: {
        Args: {
          p_agent_id?: string
          p_fase: string
          p_full_text_weight?: number
          p_match_count?: number
          p_nicho_id?: string
          p_produto_id?: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tenant_id?: string
        }
        Returns: {
          descricao_curta: string
          descricao_semantica: string
          escopo: string
          evidencias: Json
          id: string
          obrigatorio: boolean
          ordem: number
          rrf_score: number
        }[]
      }
      busca_hibrida_gatilho: {
        Args: {
          p_full_text_weight?: number
          p_match_count?: number
          p_nicho_id?: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tenant_id?: string
        }
        Returns: {
          acao_disparada: string
          acao_payload: Json
          escopo: string
          exemplo_frase: string
          id: string
          nome_trigger: string
          rrf_score: number
        }[]
      }
      busca_hibrida_humanizacao: {
        Args: {
          p_full_text_weight?: number
          p_match_count?: number
          p_nicho_id?: string
          p_persona_tags?: string[]
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tenant_id?: string
        }
        Returns: {
          categoria: string
          contexto_uso: string
          escopo: string
          exemplos_bons: string[]
          exemplos_ruins: string[]
          id: string
          prioridade: number
          quando_nao_usar: string
          regra: string
          rrf_score: number
          subcategoria: string
          tags_persona: string[]
        }[]
      }
      busca_hibrida_manipulacao: {
        Args: {
          p_fts_weight?: number
          p_nicho_id: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_sem_weight?: number
          p_tenant_id: string
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          exemplos: Json
          id: string
          resposta_padrao: string
          score: number
          severidade: string
          tipo: string
        }[]
      }
      busca_hibrida_memoria_episodica: {
        Args: {
          p_full_text_weight?: number
          p_lead_id?: string
          p_match_count?: number
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tenant_id: string
        }
        Returns: {
          criado_em: string
          decay_factor: number
          emocao: string
          episodio_resumo: string
          gancho: string
          id: string
          outcome: string
          score: number
        }[]
      }
      busca_hibrida_memoria_lead: {
        Args: {
          p_full_text_weight?: number
          p_lead_id: string
          p_match_count?: number
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tenant_id?: string
        }
        Returns: {
          categoria: string
          fato: string
          id: string
          relevancia: string
          score: number
        }[]
      }
      busca_hibrida_memoria_lead_v2: {
        Args: {
          p_full_text_weight?: number
          p_lead_id: string
          p_match_count?: number
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tenant_id?: string
        }
        Returns: {
          categoria: string
          confianca: number
          confirmado_pelo_lead: boolean
          criado_em: string
          fato: string
          id: string
          relevancia: string
          score: number
          ultima_evocacao_em: string
          valencia_emocional: number
          valido_desde: string
          vezes_evocado: number
        }[]
      }
      busca_hibrida_meta: {
        Args: {
          p_full_text_weight?: number
          p_match_count?: number
          p_nicho_id?: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tag?: string
          p_tenant_id?: string
        }
        Returns: {
          citacao_kb: string
          corpo: string
          escopo: string
          id: string
          imutavel: boolean
          prioridade: number
          rrf_score: number
          tag: string
          tags: string[]
        }[]
      }
      busca_hibrida_procedurais: {
        Args: {
          p_fts_weight?: number
          p_nicho_id: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_sem_weight?: number
          p_tenant_id: string
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          escopo: string
          id: string
          nome: string
          passos: Json
          score: number
        }[]
      }
      busca_hibrida_prova_social: {
        Args: {
          p_fts_weight?: number
          p_nicho_id: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_sem_weight?: number
          p_tenant_id: string
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          autor: string
          depoimento: string
          escopo: string
          id: string
          idade: number
          score: number
        }[]
      }
      busca_hibrida_regras_operacionais: {
        Args: {
          p_categoria?: string
          p_fts_weight?: number
          p_nicho_id?: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_sem_weight?: number
          p_tenant_id?: string
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          categoria: string
          contexto: string
          escopo: string
          id: string
          parametros: Json
          prioridade: number
          regra: string
          score: number
        }[]
      }
      busca_hibrida_variacao: {
        Args: {
          p_agent_id?: string
          p_categoria?: string
          p_match_count?: number
          p_nicho_id?: string
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_tags?: string[]
          p_tenant_id?: string
        }
        Returns: {
          categoria: string
          escopo: string
          id: string
          instrucao: string
          nome_variation: string
          prioridade: number
          rrf_score: number
          subcategoria: string
        }[]
      }
      busca_vetorial: {
        Args: {
          match_count?: number
          p_agent_id: string
          p_exclude_categories?: string[]
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          category: string
          content: string
          id: string
          similarity: number
          tags: string[]
          title: string
        }[]
      }
      buscar_leads_por_descricao: {
        Args: {
          p_match_count?: number
          p_min_similarity?: number
          p_query_embedding: unknown
          p_tenant_id: string
        }
        Returns: {
          fatos_resumo: string
          lead_id: string
          num_fatos: number
          similarity: number
        }[]
      }
      buscar_leads_por_significado: {
        Args: {
          p_full_text_weight?: number
          p_match_count?: number
          p_query_embedding: unknown
          p_query_text: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_tenant_id: string
        }
        Returns: {
          categoria: string
          fase_pipeline: string
          fato_match: string
          lead_id: string
          name: string
          phone: string
          score: number
          temperatura_lead: string
          updated_at: string
        }[]
      }
      buscar_leads_similares: {
        Args: {
          p_lead_id_referencia: string
          p_match_count?: number
          p_min_similarity?: number
          p_tenant_id: string
        }
        Returns: {
          fatos_resumo: string
          lead_id: string
          num_fatos: number
          similarity: number
        }[]
      }
      buscar_ou_criar_conversa: {
        Args: {
          p_agent_id: string
          p_channel?: string
          p_first_fase?: string
          p_phone: string
          p_tenant_id: string
        }
        Returns: Json
      }
      buscar_pergunta_similar: {
        Args: { p_embedding: unknown; p_limiar?: number; p_tenant_id: string }
        Returns: {
          id: string
          ocorrencias: number
          pergunta: string
          resposta_do_dono: string
          similaridade: number
          status_loop: string
        }[]
      }
      buscar_produto_fuzzy: {
        Args: { p_tenant_id: string; p_termo: string }
        Returns: {
          descricao_curta: string
          id: string
          nome: string
          pontuacao: number
        }[]
      }
      buscar_triggers_temporais: {
        Args: {
          p_condicao_tipo: string
          p_escopo?: string
          p_fase_aplicavel?: string
          p_nicho_id?: string
          p_tenant_id?: string
        }
        Returns: {
          acao_disparada: string
          acao_payload: Json
          fase_aplicavel: string
          id: string
          nome_trigger: string
          tempo_aguardar_minutos: number
        }[]
      }
      calcular_plano_pagamento: { Args: { p_itens: Json }; Returns: Json }
      calcular_style_profile: { Args: { p_lead_id: string }; Returns: Json }
      campaign_metrics: {
        Args: { p_campaign_id: string; p_tenant_id: string }
        Returns: {
          atividade_ultimas_24h: number
          leads_por_state: Json
          reproposta_count_total: number
          taxa_conversao: number
          tempo_medio_minutos_ate_fechamento: number
          total_leads: number
        }[]
      }
      cargos_visiveis_tenant: {
        Args: { p_incluir_inativos?: boolean }
        Returns: {
          agente_id: string
          ativo: boolean
          campos_rastreio: Json
          canal_atuacao: string
          escopo: Database["public"]["Enums"]["escopo_ragentic"]
          id: string
          nicho_id: string
          nome: string
          objetivo_principal: string
          ordem: number
          regras_livres: string
          substitui_global_id: string
          tenant_id: string
          tipologia: Database["public"]["Enums"]["cargo_tipologia"]
        }[]
      }
      carregar_contexto_agente: { Args: { p_agent_id: string }; Returns: Json }
      clusterizar_tags_observadas: {
        Args: {
          p_janela_dias?: number
          p_min_obs?: number
          p_threshold?: number
        }
        Returns: number
      }
      colunas_da_tabela: { Args: { p_tabela: string }; Returns: Json }
      completude_empresa: {
        Args: { p_tenant_id: string }
        Returns: {
          faltantes: string[]
          pontuacao: number
        }[]
      }
      concluir_servico: { Args: { p_lead_id: string }; Returns: undefined }
      confirmar_agendamento_publico: {
        Args: { p_dados?: Json; p_inicio: string; p_token: string }
        Returns: Json
      }
      confirmar_exclusao_dados: {
        Args: { p_bilhete: string; p_conversa: string; p_owner: string }
        Returns: Json
      }
      confirmar_pagamento_pedido_rifa: {
        Args: { p_aprovar: boolean; p_motivo?: string; p_pedido: string }
        Returns: Json
      }
      consulta_pode_vender: { Args: { p_tenant_id?: string }; Returns: boolean }
      consultar_dados_leitura: {
        Args: { p_limite?: number; p_owner: string; p_sql: string }
        Returns: Json
      }
      consultar_meus_numeros_rifa: {
        Args: { p_phone: string; p_token: string }
        Returns: Json
      }
      contar_publico_campanha: {
        Args: {
          p_filters: Json
          p_inatividade_ms: number
          p_tenant_id: string
          p_type: string
        }
        Returns: number
      }
      contrato_manual_item_sintetico: {
        Args: {
          p_entrada: number
          p_nome: string
          p_parcelas: number
          p_total: number
          p_valor_parc: number
        }
        Returns: Json
      }
      conversas_recentes_tenant: {
        Args: { p_dias?: number; p_limite?: number; p_tenant_id: string }
        Returns: Json
      }
      conversas_unread_humano: {
        Args: { p_tenant_id: string }
        Returns: {
          conversation_id: string
          needs_human_help: boolean
          qtd_msgs_novas: number
          ultima_msg_em: string
        }[]
      }
      converter_em_cliente: {
        Args: { p_campaign_lead_id: string }
        Returns: undefined
      }
      creditar_saldo_admin: {
        Args: { p_motivo?: string; p_tenant_id: string; p_valor: number }
        Returns: Json
      }
      crenca_resumo_tenant: {
        Args: { p_dias?: number; p_tenant_id: string }
        Returns: Json
      }
      criar_cliente_manual: {
        Args: {
          p_email?: string
          p_name: string
          p_phone: string
          p_product?: string
        }
        Returns: Json
      }
      criar_contrato_livre: {
        Args: {
          p_campos_obrigatorios?: Json
          p_chave_pix?: string
          p_conversa_id?: string
          p_dados_cliente?: Json
          p_instrucao_selfie?: string
          p_lead_id?: string
          p_link_parcelamento?: string
          p_num_testemunhas?: number
          p_origem?: string
          p_posicao_pagamento?: string
          p_tenant_id?: string
          p_texto: string
          p_titulo?: string
        }
        Returns: {
          chave_publica: string
          id: string
        }[]
      }
      criar_contrato_livre_de_template: {
        Args: { p_template_id: string; p_tenant_id?: string }
        Returns: {
          chave_publica: string
          contrato_id: string
        }[]
      }
      criar_evento_agenda: {
        Args: {
          p_convidados?: Json
          p_cor?: string
          p_criar_sala?: boolean
          p_descricao?: string
          p_dia_inteiro?: boolean
          p_fim_em?: string
          p_inicio_em: string
          p_tipo?: string
          p_titulo: string
        }
        Returns: string
      }
      criar_pedido_loja: {
        Args: { p_comprovante_url?: string; p_item_id: string; p_tipo: string }
        Returns: string
      }
      criar_sala_agora: {
        Args: { p_exige_aprovacao?: boolean; p_max?: number; p_titulo: string }
        Returns: Json
      }
      criar_template_a_partir_de_texto: {
        Args: {
          p_ativar?: boolean
          p_instrucao_selfie?: string
          p_nome: string
          p_num_testemunhas?: number
          p_placeholders?: Json
          p_produto_id?: string
          p_texto: string
        }
        Returns: {
          chunks_rag_gerados: number
          id: string
        }[]
      }
      cronjob_delete_config: { Args: { p_id: string }; Returns: boolean }
      cronjob_run_now: { Args: { p_cronjob_id: string }; Returns: Json }
      cronjob_save_config: {
        Args: { p_id: string; p_payload: Json }
        Returns: string
      }
      cronjob_toggle_ativo: { Args: { p_id: string }; Returns: boolean }
      cronjobs_saude: { Args: { p_dias?: number }; Returns: Json }
      dados_trabalho_painel: {
        Args: { p_period_start?: string; p_tenant_id: string }
        Returns: {
          conversation_id: string
          created_at: string
        }[]
      }
      debitar_carteira_consulta: {
        Args: { p_consulta_id: string }
        Returns: Json
      }
      decay_episodios: {
        Args: { p_decay_per_day?: number; p_threshold_desativar?: number }
        Returns: {
          episodios_decaidos: number
          episodios_desativados: number
        }[]
      }
      decrementar_armazenamento: {
        Args: { p_bytes: number; p_user_id: string }
        Returns: undefined
      }
      dedup_blocos_propostos: {
        Args: { p_propostas: Json; p_threshold?: number }
        Returns: Json
      }
      definir_buffer_compondo: {
        Args: { p_agent_id: string; p_composing: boolean; p_phone: string }
        Returns: Json
      }
      definir_campo_customizado: {
        Args: { p_chave: string; p_lead_id: string; p_valor: string }
        Returns: undefined
      }
      definir_contrato_pdf_url_publico: {
        Args: { p_pdf_url: string; p_token: string }
        Returns: undefined
      }
      definir_modelo_padrao: {
        Args: { p_modelo_id: string }
        Returns: undefined
      }
      definir_segredo_consulta: {
        Args: { p_nome: string; p_valor: string }
        Returns: Json
      }
      definir_tag_curadoria_intervalo: {
        Args: { p_horas: number }
        Returns: undefined
      }
      derivar_tags_para_lead: { Args: { p_lead_id: string }; Returns: number }
      derivar_template_v2: {
        Args: { p_template_id: string }
        Returns: undefined
      }
      derive_tags_for_lead: { Args: { p_lead_id: string }; Returns: number }
      desativar_pausa_conversa: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      descartar_pergunta_mentor: { Args: { p_id: string }; Returns: Json }
      descer_lead_pra_base: {
        Args: { p_lead_id: string; p_motivo?: string }
        Returns: boolean
      }
      destilar_perfil_empresa: {
        Args: { p_tenant_id?: string }
        Returns: number
      }
      detectar_comprovantes_lead: {
        Args: { p_janela_horas?: number }
        Returns: {
          atualizados: number
          criados: number
          sem_valor: number
        }[]
      }
      detectar_intent_categoria: {
        Args: { p_query_embedding: unknown; p_top_k?: number }
        Returns: {
          categorias_alvo: string[]
          frase_pivo: string
          intent: string
          similaridade: number
        }[]
      }
      detectar_leads_duplicados: {
        Args: { p_tenant_id: string }
        Returns: {
          lead_a: string
          lead_b: string
          motivo: string
          score: number
        }[]
      }
      dia_util_do_mes: {
        Args: { p_data_ref: string; p_n: number }
        Returns: string
      }
      editar_resposta_pergunta_mentor: {
        Args: { p_id: string; p_resposta: string }
        Returns: Json
      }
      eh_admin_plataforma: { Args: never; Returns: boolean }
      eh_dia_util: { Args: { p_data: string }; Returns: boolean }
      eh_super_admin: { Args: { _user_id: string }; Returns: boolean }
      email_de_apelido: { Args: { p_apelido: string }; Returns: string }
      enfileirar_acao_agendada: {
        Args: {
          p_action_type: string
          p_agente_id: string
          p_carga?: Json
          p_conversation_id: string
          p_lead_id: string
          p_node_name?: string
          p_scheduled_at: string
          p_template?: string
          p_tenant_id: string
        }
        Returns: string
      }
      entrar_sala_publica: {
        Args: { p_chave: string; p_nome: string }
        Returns: Json
      }
      enviar_comprovante_pagamento_publico: {
        Args: { p_proof_url: string; p_token: string }
        Returns: undefined
      }
      enviar_comprovante_rifa_publico: {
        Args: { p_token: string; p_url: string }
        Returns: Json
      }
      enviar_para_base: { Args: { p_lead_id: string }; Returns: undefined }
      enviar_reproposta: {
        Args: { p_campaign_lead_ids: string[]; p_texto?: string }
        Returns: {
          campaign_lead_id: string
          reproposta_id: string
          scheduled_action_id: string
          status: string
        }[]
      }
      esquema_consulta_dados: { Args: never; Returns: Json }
      estado_curadoria_completo: { Args: never; Returns: Json }
      estatisticas_painel: {
        Args: { p_period_start?: string; p_tenant_id: string }
        Returns: Json
      }
      estornar_carteira_consulta: {
        Args: { p_consulta_id: string }
        Returns: Json
      }
      excluir_campanha: { Args: { p_campaign_id: string }; Returns: undefined }
      excluir_campo_personalizado: {
        Args: { p_chave: string; p_lead_id: string }
        Returns: undefined
      }
      excluir_conversas_profundo_para_atendimento: {
        Args: { p_conversa_ids: string[] }
        Returns: Json
      }
      excluir_pergunta_mentor: { Args: { p_id: string }; Returns: Json }
      existe_compromisso_ativo: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      expirar_assinaturas: { Args: never; Returns: undefined }
      expirar_reservas_rifa: { Args: never; Returns: number }
      exportar_meus_dados: { Args: never; Returns: Json }
      extrair_pii_lead: { Args: { p_lead_id: string }; Returns: undefined }
      falhas_agrupadas_periodo: {
        Args: { p_dias?: number; p_tenant_id?: string }
        Returns: Json
      }
      fechar_objetivo_pilha: {
        Args: { p_motivo?: string; p_objetivo_id: string }
        Returns: boolean
      }
      ferramentas_por_similaridade: {
        Args: {
          p_escopo?: string
          p_nomes?: string[]
          p_query_embedding: unknown
          p_top_k?: number
        }
        Returns: {
          descricao: string
          distancia: number
          nome_tool: string
        }[]
      }
      fila_apagar: {
        Args: { msg_id: number; queue_name: string }
        Returns: boolean
      }
      fila_arquivar: {
        Args: { msg_id: number; queue_name: string }
        Returns: boolean
      }
      fila_enviar: {
        Args: { delay?: number; msg: Json; queue_name: string }
        Returns: number
      }
      fila_ler: {
        Args: { qty?: number; queue_name: string; vt?: number }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_alertas_dossie: { Args: { p_lead_id: string }; Returns: Json }
      fn_buscar_gatilhos_reativos: {
        Args: {
          p_cargo_id?: string
          p_cenario?: string
          p_limite?: number
          p_tenant_id: string
        }
        Returns: {
          acao_carga: Json | null
          acao_tipo: string | null
          ativo: boolean | null
          cargo_id: string | null
          cenario: string | null
          criado_em: string | null
          escopo: string | null
          exemplo_frase: string | null
          id: string | null
          nicho_id: string | null
          origem: string | null
          tenant_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "vw_gatilhos_reativos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_dossie_lead_consolidado: {
        Args: { p_conversa_id?: string; p_lead_id: string }
        Returns: Json
      }
      fn_rate_limit_consumir: {
        Args: { _limite_por_min?: number; _tenant_id: string }
        Returns: boolean
      }
      fn_rate_limit_limpar: { Args: never; Returns: undefined }
      fn_saude_motor: {
        Args: never
        Returns: {
          fila: string
          pendentes: number
          ultimo_evento: string
        }[]
      }
      fn_sou_dono_do_agente: { Args: { p_agente: string }; Returns: boolean }
      fn_sou_gestor_delegado: { Args: { p_agente: string }; Returns: boolean }
      fn_tags_do_texto: { Args: { p_texto: string }; Returns: string[] }
      garantir_categorias_padrao: {
        Args: { p_tenant_id?: string }
        Returns: number
      }
      gerar_contrato_do_template: {
        Args: {
          p_agente_id?: string
          p_conversa_id: string
          p_dados_cliente?: Json
          p_lead_id?: string
          p_template_id?: string
          p_tenant_id?: string
        }
        Returns: {
          chave_publica: string
          contrato_id: string
          nome_template: string
          qtd_itens: number
          total: number
        }[]
      }
      gerar_link_consulta: {
        Args: {
          p_agente_id?: string
          p_conversa_id?: string
          p_lead_id?: string
          p_tenant_id?: string
        }
        Returns: Json
      }
      gerar_sugestoes_fusao_tag: {
        Args: { p_min_leads?: number; p_nicho_id: string; p_threshold?: number }
        Returns: number
      }
      get_conversas_usadas: { Args: { p_tenant_id: string }; Returns: number }
      get_indicador_publico: { Args: { p_token: string }; Returns: Json }
      get_lead_tracking_status: {
        Args: { _chave: string }
        Returns: {
          client_checkpoints: Json
          created_at: string
          fase_cliente: string
          fase_pipeline: string
          id: string
          is_hot: boolean
          pontuacao: number
          precisa_humano: boolean
          tarefas_cliente: Json
          temperatura_lead: string
          updated_at: string
        }[]
      }
      get_minha_rede: {
        Args: { p_owner_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          multinivel_ativo: boolean
          sub_indicados: number
        }[]
      }
      get_tom_agente: { Args: { p_user_agent_id: string }; Returns: string }
      historico_cobranca_lead: {
        Args: { p_lead_id: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          data: string
          meta: Json
          status: string
          tipo: string
          valor: number
        }[]
      }
      importar_contatos_para_base: {
        Args: { p_contatos: Json; p_tenant_id: string }
        Returns: number
      }
      incrementar_dica_consumida: {
        Args: { p_dica_id: string; p_turno: number }
        Returns: boolean
      }
      incrementar_meta_blocos_uso: {
        Args: { p_ids: string[] }
        Returns: number
      }
      info_sala_publica: { Args: { p_chave: string }; Returns: Json }
      integracao_confirmar_ativacao: {
        Args: {
          p_com_implantacao?: boolean
          p_plano_id: string
          p_user_id: string
        }
        Returns: Json
      }
      integracao_provisionar_conta: {
        Args: { p_dados?: Json; p_nicho_id: string; p_user_id: string }
        Returns: Json
      }
      is_platform_admin: { Args: never; Returns: boolean }
      lead_memory_similar: {
        Args: {
          p_embedding: unknown
          p_lead_id: string
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          fato: string
          id: string
          similarity: number
        }[]
      }
      ler_chave_gestao_openrouter: { Args: never; Returns: string }
      ler_config_consulta: { Args: { p_provedor?: string }; Returns: Json }
      ler_segredo_cron: { Args: never; Returns: string }
      liberar_trava_conversa: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      liberar_trava_motor: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      liberar_zumbis: {
        Args: { p_max_idade_minutos?: number }
        Returns: number
      }
      limpar_antes_embedar: {
        Args: { p_cap_bytes?: number; p_text: string }
        Returns: Json
      }
      limpar_intencoes_antigas: { Args: never; Returns: number }
      limpar_prompts_turno_expirados: { Args: never; Returns: number }
      limpar_traces_antigos: { Args: never; Returns: number }
      linha_do_tempo_contato: {
        Args: { p_lead_id: string; p_limite?: number; p_tenant_id: string }
        Returns: {
          descricao: string
          quando: string
          tipo: string
        }[]
      }
      listar_jobs_com_historico: {
        Args: never
        Returns: {
          ativo: boolean
          categoria: string
          cron_expr: string
          descricao: string
          duracao_media_ms: number
          falhas_7d: number
          jobid_pg_cron: number
          nome: string
          status_ultima: string
          sucessos_7d: number
          ultima_exec: string
        }[]
      }
      listar_leads_por_dia: {
        Args: {
          p_fim: string
          p_inicio: string
          p_limite?: number
          p_tenant_id: string
        }
        Returns: {
          fase_pipeline: string
          lead_id: string
          name: string
          phone: string
          temperatura_lead: string
          total_mensagens: number
          ultima_mensagem_em: string
          updated_at: string
        }[]
      }
      marcar_conversa_lida: { Args: { p_conv_id: string }; Returns: undefined }
      marcar_handoff_atendido: {
        Args: { p_lead_id: string }
        Returns: undefined
      }
      marcar_lead_recusado: {
        Args: { p_lead_id: string; p_motivo?: string }
        Returns: boolean
      }
      marcar_leads_sumidos: {
        Args: { p_dias_sem_resposta?: number }
        Returns: {
          marcados: number
        }[]
      }
      mascarar_cnpj: { Args: { p_cnpj: string }; Returns: string }
      mascarar_cpf: { Args: { p_cpf: string }; Returns: string }
      memoria_lead_similar: {
        Args: {
          p_embedding: unknown
          p_lead_id: string
          p_threshold?: number
          p_top_k?: number
        }
        Returns: {
          fato: string
          id: string
          similarity: number
        }[]
      }
      mesclar_lead: {
        Args: { p_lead_canonico_id: string; p_lead_duplicado_id: string }
        Returns: boolean
      }
      metricas_base: { Args: { p_tenant_id: string }; Returns: Json }
      metricas_campanha: {
        Args: { p_campaign_id: string; p_tenant_id: string }
        Returns: {
          atividade_ultimas_24h: number
          leads_por_state: Json
          reproposta_count_total: number
          taxa_conversao: number
          tempo_medio_minutos_ate_fechamento: number
          total_leads: number
        }[]
      }
      metricas_unread_humano: { Args: { p_tenant_id: string }; Returns: Json }
      migrar_automacoes_para_retornos: { Args: { cfg: Json }; Returns: Json }
      migrar_filtros_campanha: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      movimentar_estoque: {
        Args: {
          p_item_id: string
          p_motivo?: string
          p_quantidade: number
          p_tipo: string
        }
        Returns: number
      }
      normalizar_tag: {
        Args: { p_nicho_id?: string; p_tag_text: string; p_tenant_id: string }
        Returns: {
          chave_canonica: string
          valor_canonico: string
          vocabulario_id: string
        }[]
      }
      normalizar_telefone: { Args: { p_tel: string }; Returns: string }
      normalizar_telefone_brasil: { Args: { p_bruto: string }; Returns: string }
      notificar_empresas_incompletas: { Args: never; Returns: number }
      obter_agenda_publica: { Args: { p_token: string }; Returns: Json }
      obter_config_chamada_llm: {
        Args: { p_chave: string; p_nicho_id?: string; p_tenant_id?: string }
        Returns: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          criado_em: string
          custo_teto_diario: number | null
          deleted_at: string | null
          descricao: string | null
          escopo: string
          gavetas_ativas: Json
          itens_produzidos: string[]
          json_mode: boolean
          max_tokens: number
          modelo: string
          nicho_id: string | null
          nome: string
          notas: string | null
          posicao: string
          prompt_template: string
          schedule: string | null
          temperatura: number
          tenant_id: string | null
          versao: number
        }
        SetofOptions: {
          from: "*"
          to: "config_chamadas_llm"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      obter_consulta_por_token: { Args: { p_token: string }; Returns: Json }
      obter_contrato_por_token: {
        Args: { p_token: string }
        Returns: {
          agente_id: string
          assinado_em: string
          campos_cliente: string[]
          campos_obrigatorios: Json
          chave_pix: string
          chave_publica: string
          conversa_id: string
          cor_pagina: string
          dados_cliente: Json
          dados_pagamento: Json
          descricao_empresa: string
          forma_pagamento_escolhida: Json
          id: string
          instrucao_selfie: string
          link_parcelamento: string
          logo_url: string
          metodo_pagamento: string
          nome_empresa: string
          num_testemunhas: number
          opcoes_pagamento: Json
          origem: string
          pdf_url: string
          placeholders: Json
          posicao_pagamento: string
          status: string
          texto_contrato: string
          titulo: string
          url_comprovante_pagamento: string
        }[]
      }
      obter_dados_publicos_empresa: { Args: { p_token: string }; Returns: Json }
      obter_documentos_publicos_cliente: {
        Args: { p_token: string }
        Returns: Json
      }
      obter_dono_indicacao_id: { Args: never; Returns: string }
      obter_ficha_lead_completa: { Args: { p_lead_id: string }; Returns: Json }
      obter_fluxo_publico_servico: { Args: { p_token: string }; Returns: Json }
      obter_metricas_campanha: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      obter_meu_usuario_pai_id: { Args: never; Returns: string }
      obter_pedido_rifa_por_token: { Args: { p_token: string }; Returns: Json }
      obter_prompts_conversa: {
        Args: { p_conversation_id: string }
        Returns: {
          bolhas_count: number
          chunks_usados: Json
          created_at: string
          fase_atual: string
          message_id: string
          modelo: string
          rag_ativacao: Json
          system_prompt: string
          trigger_disparado: Json
          turno_tipo: string
          user_message: string
        }[]
      }
      obter_rifa_por_token: { Args: { p_token: string }; Returns: Json }
      obter_segredo_vault: { Args: { p_nome: string }; Returns: string }
      obter_uso_armazenamento: { Args: { p_user_id: string }; Returns: Json }
      parse_tempo_relativo: { Args: { p_str: string }; Returns: string }
      pausar_recurso_curadoria: { Args: { p_chave: string }; Returns: Json }
      pegar_proxima_acao_agendada: {
        Args: { p_limite?: number }
        Returns: {
          action_type: string
          agente_id: string | null
          campaign_id: string | null
          carga: Json | null
          conversation_id: string | null
          created_at: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          lead_id: string | null
          node_name: string | null
          scheduled_at: string
          status: string | null
          template: string | null
          tenant_id: string | null
          tentativas: number
        }[]
        SetofOptions: {
          from: "*"
          to: "acoes_agendadas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      peso_recencia_episodio: {
        Args: { p_criado_em: string; p_half_life_dias?: number }
        Returns: number
      }
      pgmq_archive_batch: {
        Args: { p_msg_ids: number[]; p_queue: string }
        Returns: undefined
      }
      preencher_candidatos_tag: {
        Args: { p_nicho_id: string }
        Returns: number
      }
      preparar_exclusao_dados: {
        Args: { p_conversa: string; p_owner: string; p_sql: string }
        Returns: Json
      }
      preparar_exclusao_dados_nucleo: {
        Args: { p_conversa: string; p_owner: string; p_sql: string }
        Returns: Json
      }
      processar_tarefas_vetor_semantico: {
        Args: { p_batch?: number }
        Returns: number
      }
      promover_blocos_cross_nicho: { Args: never; Returns: Json }
      promover_meta_blocos_estaveis: {
        Args: { p_janela_dias?: number; p_min_usos?: number }
        Returns: number
      }
      proximo_dia_util: { Args: { p_data: string }; Returns: string }
      proximo_recebimento: {
        Args: { p_padrao: string; p_ref?: string }
        Returns: string
      }
      publico_obter_perfil: { Args: { p_slug: string }; Returns: Json }
      purgar_soft_delete_expirado: { Args: never; Returns: Json }
      rebufferar_mensagens: {
        Args: {
          p_agent_id: string
          p_media_type?: string
          p_media_url?: string
          p_phone: string
          p_texto: string
        }
        Returns: undefined
      }
      recalcular_armazenamento: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      recalcular_contagem_segmento: {
        Args: { p_segmento_id: string }
        Returns: number
      }
      recalcular_pesos_gavetas_tenant: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      recomputar_humor_relacao: { Args: { p_dias?: number }; Returns: number }
      reconsolidar_episodios: {
        Args: { p_boost?: number; p_ids: string[] }
        Returns: number
      }
      reconsolidar_fatos: { Args: { p_ids: string[] }; Returns: number }
      recusar_saque: { Args: { p_saque_id: string }; Returns: undefined }
      registrar_evento_contrato: {
        Args: { p_evento: string; p_meta?: Json; p_token: string }
        Returns: undefined
      }
      reivindicar_buffer_mensagem: {
        Args: { p_agent_id: string; p_phone: string }
        Returns: Json
      }
      remover_membro_equipe: { Args: { member_id: string }; Returns: undefined }
      reservar_numeros_rifa_publico: {
        Args: {
          p_conversa_id?: string
          p_fiado?: boolean
          p_lead_id?: string
          p_nome: string
          p_numeros?: number[]
          p_origem?: string
          p_phone: string
          p_qtd?: number
          p_sem_expiracao?: boolean
          p_token: string
          p_utm?: Json
        }
        Returns: Json
      }
      reservar_orcamento_porteiro: {
        Args: {
          p_cap_global?: number
          p_cap_ip?: number
          p_custo_centesimos?: number
          p_ip: string
        }
        Returns: boolean
      }
      resetar_ciclo_assinatura: {
        Args: { p_dias?: number; p_user_id: string }
        Returns: undefined
      }
      resolver_codigo_indicacao: { Args: { p_code: string }; Returns: string }
      resolver_cupom_ativo: {
        Args: { p_codigo: string; p_tenant_id: string }
        Returns: {
          campaign_id: string
          comissao_tipo: string
          comissao_valor: number
        }[]
      }
      responder_entrada_sala: {
        Args: { p_aprovar: boolean; p_participante_id: string }
        Returns: Json
      }
      responder_pergunta_mentor: {
        Args: { p_id: string; p_resposta: string }
        Returns: Json
      }
      resumo_ausencia: { Args: { p_desde: string }; Returns: Json }
      resumo_cliente: { Args: { p_lead_id: string }; Returns: Json }
      revert_tag_merge: { Args: { p_log_id: string }; Returns: number }
      rifa_pode_vender: { Args: { p_tenant_id?: string }; Returns: boolean }
      rpc_metricas_motor: {
        Args: { _dias?: number; _tenant_id?: string }
        Returns: Json
      }
      sair_sala_publica: {
        Args: { p_participante_id: string }
        Returns: undefined
      }
      salvar_resultados_turno: {
        Args: {
          p_agent_messages: string[]
          p_agent_payload?: Json
          p_campaign_lead_id?: string
          p_ciclo: number
          p_completion_tokens?: number
          p_conversation_id: string
          p_cost_usd?: number
          p_dados_capturados: Json
          p_fase: string
          p_historico_fases: string[]
          p_latency_ms?: number
          p_lead_card_id: string
          p_llm_metadata?: Json
          p_media_type?: string
          p_media_url?: string
          p_model?: string
          p_prompt_tokens?: number
          p_pular_insert_user?: boolean
          p_resumo: string
          p_tenant_id?: string
          p_user_message: string
        }
        Returns: undefined
      }
      selecionar_conversas_amostra: {
        Args: { p_limite?: number }
        Returns: {
          conversation_id: string
          lead_id: string
          num_messages: number
          tenant_id: string
          ultima_mensagem_em: string
        }[]
      }
      sincronizar_numeros_fixos_rifa: {
        Args: { p_rifa: string }
        Returns: Json
      }
      sincronizar_template_contrato_para_rag: {
        Args: { p_contrato_id: string }
        Returns: {
          chunks_atualizados: number
          chunks_inseridos: number
          chunks_total: number
        }[]
      }
      slots_disponiveis: {
        Args: { p_dia: string; p_pessoa_id?: string; p_tenant_id: string }
        Returns: {
          pessoa_id: string
          slot_inicio: string
        }[]
      }
      solicitar_exclusao_conta: { Args: never; Returns: undefined }
      solicitar_saque: {
        Args: { p_chave_pix: string; p_valor: number }
        Returns: string
      }
      sortear_rifa: {
        Args: {
          p_numero_manual?: number
          p_numeros_manuais?: number[]
          p_rifa: string
        }
        Returns: Json
      }
      submeter_consulta_publica: {
        Args: { p_payload: Json; p_token: string }
        Returns: Json
      }
      substituir_caixa_saida_pendentes: {
        Args: { p_conversation_id: string; p_since?: string }
        Returns: number
      }
      tags_disponiveis_base: {
        Args: { p_tenant_id: string }
        Returns: string[]
      }
      tem_papel: {
        Args: { _papel: string; _user_id: string }
        Returns: boolean
      }
      tentar_trava_conversa: {
        Args: { p_conversation_id: string; p_ttl_seconds?: number }
        Returns: boolean
      }
      togglar_job: { Args: { p_ativo: boolean; p_nome: string }; Returns: Json }
      tornar_cliente_via_base: {
        Args: { p_lead_id: string }
        Returns: undefined
      }
      unread_por_conversa: { Args: { p_tenant_id: string }; Returns: Json }
      update_blocos_fts: { Args: { p_agent_id: string }; Returns: undefined }
      varrer_buffers_orfaos: { Args: never; Returns: number }
      verificar_buffer_pronto: {
        Args: {
          p_agent_id: string
          p_phone: string
          p_threshold_seconds?: number
        }
        Returns: Json
      }
      verificar_dedup_webhook: {
        Args: {
          p_hash?: string
          p_window_seconds?: number
          p_zapi_message_id?: string
        }
        Returns: boolean
      }
      verificar_incrementar_armazenamento: {
        Args: { p_bytes: number; p_user_id: string }
        Returns: boolean
      }
      verificar_limite_taxa: {
        Args: {
          p_endpoint: string
          p_identifier: string
          p_max_requests?: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      verificar_limite_taxa_publico: {
        Args: {
          p_endpoint: string
          p_identifier: string
          p_max_per_hour?: number
        }
        Returns: undefined
      }
    }
    Enums: {
      cargo_tipologia: "atendimento" | "mentor" | "face_cliente" | "admin"
      escopo_ragentic: "global" | "nicho" | "tenant"
      trace_tipo:
        | "porteiro"
        | "sintese"
        | "ferramenta"
        | "erro"
        | "sintese_vazia_silencio"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      cargo_tipologia: ["atendimento", "mentor", "face_cliente", "admin"],
      escopo_ragentic: ["global", "nicho", "tenant"],
      trace_tipo: [
        "porteiro",
        "sintese",
        "ferramenta",
        "erro",
        "sintese_vazia_silencio",
      ],
    },
  },
} as const


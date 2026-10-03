/**
 * Catálogo de tools do Cargo Mentor — schemas OpenAI tool-calling.
 *
 * 6 tools básicas que o Mentor pode executar diretamente no sistema
 * do tenant via conversa natural.
 */

import type { ToolSchema } from "./compartilhado/openrouter.ts";

export const TOOLS_MENTOR: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "abrir_app",
      description:
        "Solicita ao frontend que abra um app específico no desktop OS. Use quando o usuário pedir pra abrir, acessar ou navegar para alguma tela.",
      parameters: {
        type: "object",
        properties: {
          app_id: {
            type: "string",
            description:
              "Identificador do app (ex: 'produtos', 'clientes', 'agente', 'financeiro', 'contratos', 'conhecimento', 'empresa', 'categorias').",
          },
        },
        required: ["app_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_produto",
      description:
        "Cadastra um novo produto no sistema do tenant. Use quando o usuário pedir pra criar, adicionar ou cadastrar um produto.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do produto." },
          descricao: { type: "string", description: "Descrição curta do produto." },
          categoria_id: {
            type: "string",
            description: "UUID da categoria do produto (opcional).",
          },
        },
        required: ["nome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_cliente",
      description:
        "Cadastra um novo cliente (lead convertido) no sistema. Use quando o usuário informar dados de um cliente.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome completo do cliente." },
          telefone: { type: "string", description: "Telefone do cliente (com DDD)." },
          email: { type: "string", description: "E-mail do cliente (opcional)." },
        },
        required: ["nome", "telefone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_empresa",
      description:
        "Atualiza dados da empresa do tenant. Use quando o usuário quiser editar o perfil, nome, CNPJ, endereço ou telefone da empresa.",
      parameters: {
        type: "object",
        properties: {
          nome_fantasia: { type: "string", description: "Nome fantasia da empresa." },
          cnpj: { type: "string", description: "CNPJ da empresa." },
          endereco: { type: "string", description: "Endereço completo." },
          telefone: { type: "string", description: "Telefone de contato da empresa." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_categoria",
      description:
        "Cria uma nova categoria de produto. Use quando o usuário pedir pra criar, adicionar ou cadastrar uma categoria.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome da categoria." },
          descricao: { type: "string", description: "Descrição da categoria (opcional)." },
        },
        required: ["nome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mostrar_kpi",
      description:
        "Mostra um KPI visual do tenant com série temporal. Use quando o usuário perguntar sobre métricas, números, desempenho, indicadores, vendas, faturamento ou pagamentos. vendas_mes = soma em R$ das conversões (contratos assinados). recebimentos_mes = dinheiro que ENTROU de fato (pagamentos confirmados dos clientes).",
      parameters: {
        type: "object",
        properties: {
          metrica: {
            type: "string",
            enum: ["leads_quentes", "vendas_mes", "recebimentos_mes", "conversoes_mes", "tempo_resposta_p95", "taxa_conversao"],
            description: "Qual métrica exibir.",
          },
          periodo: {
            type: "string",
            enum: ["7d", "30d", "90d"],
            description: "Período de análise (padrão: 30d).",
          },
        },
        required: ["metrica"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_leads_recentes",
      description:
        "Lista leads recentes do tenant com filtro opcional. Use quando o usuário quiser ver, checar ou buscar leads.",
      parameters: {
        type: "object",
        properties: {
          filtro: {
            type: "string",
            enum: ["quente", "frio", "novo", "inativo"],
            description: "Filtrar por temperatura ou recência (opcional).",
          },
          limite: {
            type: "number",
            description: "Quantidade máxima de leads a retornar (padrão: 10, máx: 50).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dashboard_resumo",
      description:
        "Exibe um painel resumo com cards de visão geral do tenant. Use quando o usuário pedir resumo, visão geral ou dashboard.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_app_os",
      description:
        "Solicita ao Desktop OS que abra um app pelo slug. Use quando o usuário pedir pra navegar para uma tela específica.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description:
              "Slug do app no Desktop OS (ex: 'atendimento', 'campanha', 'curadoria', 'painel', 'agente', 'whatsapp').",
          },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mostrar_desktop",
      description:
        "Minimiza todas as janelas e revela o desktop. Use quando o usuário pedir pra mostrar o desktop ou limpar a tela.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_anotacao_mentor",
      description:
        "Salva uma anotação de longo prazo para o Mentor se lembrar entre sessões. Use quando o usuário pedir pra anotar, lembrar ou registrar algo importante.",
      parameters: {
        type: "object",
        properties: {
          conteudo: {
            type: "string",
            description: "Texto da anotação.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags para categorizar a anotação (opcional).",
          },
        },
        required: ["conteudo"],
      },
    },
  },
  // ====================================================================
  // App Contratos · Onda 3 (2026-05-13)
  // O agente mestre vira fábrica: cola texto OU anexa arquivo →
  // gera link de contrato livre OU vira template reutilizável.
  // ====================================================================
  {
    type: "function",
    function: {
      name: "gerar_link_contrato_livre",
      description:
        "Cria um contrato livre (sem template) a partir de um texto colado pelo tenant e retorna o link público de assinatura. Use quando o tenant cola/anexa texto de contrato e quer um link único pra UM cliente, sem virar modelo.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Texto completo do contrato." },
          titulo: { type: "string", description: "Título do contrato (ex: 'Contrato de Prestação')." },
          lead_id: { type: "string", description: "UUID do lead destinatário (opcional)." },
          conversa_id: { type: "string", description: "UUID da conversa relacionada (opcional)." },
        },
        required: ["texto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_template_contrato",
      description:
        "Cria um template reutilizável de contrato a partir do texto colado/anexado, detectando automaticamente os placeholders (variáveis) e propondo cada um pra aprovação. Use quando o tenant quer transformar um texto em modelo reutilizável.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome curto do template (ex: 'Limpa Nome Padrão')." },
          texto: { type: "string", description: "Texto completo do contrato com ou sem placeholders." },
          produto_id: { type: "string", description: "UUID do produto a vincular (opcional)." },
          ativar: { type: "boolean", description: "Se true, ativa o template imediatamente e dispara a atomização RAG. Default false (rascunho)." },
        },
        required: ["nome", "texto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_bloco_conhecimento",
      description:
        "Cadastra um bloco de conhecimento (informação, FAQ, procedimento) que o agente pode usar no RAG. Use quando o usuário quiser ensinar algo ao agente.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título do bloco." },
          conteudo: { type: "string", description: "Conteúdo completo do bloco." },
          escopo: {
            type: "string",
            enum: ["tenant", "nicho"],
            description:
              "'tenant' para conhecimento exclusivo deste tenant, 'nicho' para compartilhar com o nicho.",
          },
        },
        required: ["titulo", "conteudo", "escopo"],
      },
    },
  },
];


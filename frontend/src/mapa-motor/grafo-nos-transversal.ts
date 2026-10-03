// Nós transversais do motor (tools do cargo externo)
// Fonte: agent-output/analises/grafo-motor-vivo.json — gerado 2026-05-18

import type { NoMotorDados } from "./tipos";

export const NOS_TRANSVERSAL: NoMotorDados[] = [
  {
    id: "tools-cargo-externo",
    label: "Tools do Cargo — despacharFerramenta (transversal)",
    canal: "externo",
    faz: "Pool de handlers em _shared/tools-internas.ts: transferir_humano (UPDATE conversas+leads+tickets_conversa), agendar_compromisso (UPDATE leads.dados_ficha.compromissos + INSERT acoes_agendadas), buscar_blocos_conhecimento (RPC busca_hibrida_conhecimento+rerank), gerar_contrato (RPC gerar_contrato_do_template), enviar_link_contrato (idem), gerenciar_compromisso, atualizar_prancheta (UPSERT crenca_conversa.belief), query_leads_filtro, buscar_gatilhos_reativos (RPC fn_buscar_gatilhos_reativos), mostrar_kpi, dashboard_resumo, funil_de_vendas, escalar_supervisor, enviar_para_* (financeiro/juridico/pos_venda), marcar_contrato_assinado, gerenciar_carrinho, listar_leads_recentes",
    ativa_proximo: "Resultado JSON retorna pro LLM (mensagem role=tool) → próxima iteração loop",
    fonte_dado_real: "INCERTO: lista completa de tabelas gravadas por cada handler — ver _shared/tools-internas.ts:HANDLERS. Confirmado: acoes_agendadas (INSERT), conversas (UPDATE), leads (UPDATE), tickets_conversa (INSERT), crenca_conversa (UPSERT), contratos (via RPC)",
    ref: "supabase/functions/_shared/tools-internas.ts:HANDLERS",
  },
];

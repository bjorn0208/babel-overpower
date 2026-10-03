/**
 * Monta um objeto `Conversa` mínimo a partir de um lead da Base, só pra
 * alimentar o `Dossie` (que hidrata o conteúdo real via
 * `enriquecerDossieViaRPC` → `fn_dossie_lead_consolidado`, o dado do motor
 * RAGENTIC). Mesmo padrão do `conversaInicial` do ChatTeste. Onda 2026-05-16.
 *
 * Os campos mock aqui são só placeholder de primeiro render; o Dossiê
 * substitui tudo pelo dado real do RPC assim que monta (lead.id + conversaId).
 */
import type {
  Cargo,
  Conversa,
  Pensamento,
} from "../conversas/tipos";

export interface LeadBase {
  id: string;
  nome: string;
  telefone: string;
  foto_url?: string;
  produto?: string | null;
  conversa_id: string | null;
}

const CARGO_PADRAO: Cargo = {
  id: "base",
  nome: "Base",
  tipologia: "atendimento",
  cor_acento: "var(--txt-3)",
  campos_rastreio: [],
};

const PENSAMENTO_PADRAO: Pensamento = {
  id: "derivado",
  proxima_intencao: "",
  acao_pretendida: "responder_e_aguardar",
  leitura_da_situacao: null,
  motivo: null,
  quando_voltar: null,
  plano_proximos_turnos: [],
  criado_em: new Date().toISOString(),
};

export function montarConversaDeLead(lead: LeadBase): Conversa {
  const agora = new Date().toISOString();
  return {
    id: lead.conversa_id ?? `base-${lead.id}`,
    lead: {
      id: lead.id,
      nome: lead.nome,
      telefone: lead.telefone,
      foto_url: lead.foto_url,
      canal: "whatsapp",
      estado: "cliente",
      memoria_longa: {
        resumo: "",
        pontos_chave: [],
        engajamento_score: 0,
        primeiro_contato_iso: agora,
      },
      timeline: [],
    },
    status: "encerrada",
    agente_ligado: false,
    cargo_ativo: CARGO_PADRAO,
    responsavel_id: null,
    ultima_mensagem_em: agora,
    preview_ultima_mensagem: "",
    mensagens_nao_lidas: 0,
    mente: {
      cargo_ativo: CARGO_PADRAO,
      pensamento: PENSAMENTO_PADRAO,
      tags: [],
      dados_capturados: {},
      prancheta_belief: {},
      confianca_atual: 0,
      score_lead: 0,
      cobertura_prancheta: 0,
      compromissos_ativos: [],
      atualizado_em: agora,
    },
    mensagens: [],
    contratos: [],
    pagamentos: [],
    pedidos: [],
    compromissos: [],
  };
}

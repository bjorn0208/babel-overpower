/**
 * Tipos do Mentor de Disparo — espelha `listas_disparo_lead` /
 * `disparos_lead` / `disparos_lead_envios` (migration
 * `20260828063000_mentor_disparo_lead.sql`).
 *
 * `criterios` da lista salva guarda o MESMO shape resolvido no backend
 * (`supabase/functions/_shared/resolver-criterios-lead.ts`) — não inventa
 * formato novo, só estende `FiltrosCampanha` (`../tipos.ts`) com as 4
 * chaves canônicas que não existem no wizard de campanha.
 */

export type OperadorCriterioLead = "eq" | "in" | "gte" | "lte";

export interface CriterioLead {
  chave: string;
  operador: OperadorCriterioLead;
  valor?: string | number;
  valores?: string[];
}

export type ModoPublicoLead = "todos" | "segmento";

export type PublicoLead = "lead" | "cliente" | "ambos";

export interface CriteriosListaDisparo {
  modo: ModoPublicoLead;
  operadorGlobal: "AND" | "OR";
  criterios: CriterioLead[];
  publico?: PublicoLead;
}

export interface ListaDisparoLead {
  id: string;
  tenant_id: string;
  nome: string;
  criterios: CriteriosListaDisparo;
  lead_ids: string[] | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TipoConteudoDisparo = "foto" | "texto" | "video" | "foto_texto";

export interface ContatoManualDisparo {
  telefone: string;
  nome: string | null;
}

export interface DisparoLead {
  id: string;
  tenant_id: string;
  lista_disparo_id: string | null;
  nome: string;
  horario: string | null;
  tipo_conteudo: TipoConteudoDisparo;
  mensagem: string | null;
  midia_url: string | null;
  contatos_ids: string[] | null;
  contatos_manuais: ContatoManualDisparo[] | null;
  tempo_descanso_segundos: number;
  ativo: boolean;
  ultima_execucao_dia: string | null;
  created_at: string;
  updated_at: string;
}

export type StatusEnvioDisparo = "sucesso" | "erro";

export interface DisparoLeadEnvio {
  id: string;
  tenant_id: string;
  disparo_id: string | null;
  lead_id: string | null;
  phone: string | null;
  status: StatusEnvioDisparo;
  mensagem_enviada: string | null;
  erro_detalhe: string | null;
  created_at: string;
}

/** Chaves canônicas resolvidas contra coluna real de `leads` (não tag). */
export const CHAVES_CANONICAS_LEAD: Array<{
  chave: string;
  rotulo: string;
  hint: string;
}> = [
  { chave: "desfecho", rotulo: "Estado final (desfecho)", hint: "Parou de responder = sumido" },
  { chave: "dias_sem_resposta", rotulo: "Dias sem resposta", hint: "Follow-up por tempo parado" },
  { chave: "mes_entrada", rotulo: "Mês de entrada", hint: "Quando o lead chegou na base" },
  { chave: "mes_desfecho", rotulo: "Mês do desfecho", hint: "Quando o estado final foi cravado" },
];

export const OPCOES_DESFECHO = [
  { valor: "sumido", rotulo: "Sumido (parou de responder)" },
  { valor: "outro", rotulo: "Outro (ex.: interesse, mas não agora)" },
  { valor: "desqualificado", rotulo: "Desqualificado" },
  { valor: "recusado", rotulo: "Recusado" },
  { valor: "convertido", rotulo: "Convertido" },
];

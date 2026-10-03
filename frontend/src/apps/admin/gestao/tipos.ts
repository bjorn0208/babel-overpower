/**
 * Tipos, papéis, permissões e helpers do app Gestão (financeiro + operação da própria babel).
 *
 * Padrão copiado de apps/user/financeiro/tipos.ts (toast, SupabaseBruto, formatação, inputStyle).
 * Sem lógica de UI e sem importar "@/": este arquivo é carregado também pelo teste de cálculos.
 *
 * FATO: as linhas abaixo espelham as colunas de `gestao_*` em sandbox-gestao/sql/03-GESTAO.sql.
 * Quem decide leitura e escrita é a RLS do banco; as tabelas LEITURA/ESCRITA daqui só decidem
 * o que a interface mostra ou esconde (a UI só esconde).
 */

import type React from "react";

// ---------------------------------------------------------------------------
// Papéis e abas (README do pacote, "Controle de acesso por papel")
// ---------------------------------------------------------------------------

export type Papel =
  | "admin"
  | "financeiro"
  | "comercial"
  | "implementacao"
  | "programador"
  | "suporte";

export const PAPEIS: Array<{ id: Papel; rotulo: string; descricao: string }> = [
  { id: "admin", rotulo: "Admin", descricao: "Tudo, inclusive esta aba de acessos" },
  {
    id: "financeiro",
    rotulo: "Financeiro",
    descricao: "Painel, clientes, vendas, parcelas, mensalidades e atividade",
  },
  { id: "comercial", rotulo: "Comercial", descricao: "Indicações, vendas e clientes" },
  { id: "implementacao", rotulo: "Implementação", descricao: "Aba Implementação" },
  { id: "programador", rotulo: "P&D", descricao: "Aba P&D (antiga Programador)" },
  { id: "suporte", rotulo: "Suporte", descricao: "Aba Suporte" },
];

/** Os 4 contextos de atendimento que reaproveitam a mesma tela de detalhe (Lote H). */
export type ContextoAtendimento = "impl" | "prog" | "sup" | "ind";

export type Aba =
  | "painel"
  | "indicacoes"
  | "vendas"
  | "clientes"
  | "implementacao"
  | "programador"
  | "suporte"
  | "tarefas"
  | "setup"
  | "mensalidades"
  | "atividade"
  | "acessos";

/** Ordem e rótulos das 12 abas (financeiro.html:405-417 e ORDEM_ABAS, linha 3252). */
export const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "painel", rotulo: "Painel" },
  { id: "indicacoes", rotulo: "Indicações" },
  { id: "vendas", rotulo: "Vendas" },
  { id: "clientes", rotulo: "Clientes" },
  { id: "implementacao", rotulo: "Implementação" },
  { id: "programador", rotulo: "P&D" },
  { id: "suporte", rotulo: "Suporte" },
  { id: "tarefas", rotulo: "Tarefas do time" },
  { id: "setup", rotulo: "Parcelas do setup" },
  { id: "mensalidades", rotulo: "Mensalidades" },
  { id: "atividade", rotulo: "Atividade babel" },
  { id: "acessos", rotulo: "Acessos" },
];

/** Abas de cada papel (ABAS_PAPEL, financeiro.html:3253). Todo papel também vê "tarefas". */
const ABAS_DO_PAPEL: Record<Exclude<Papel, "admin">, Aba[]> = {
  financeiro: ["painel", "clientes", "vendas", "setup", "mensalidades", "atividade"],
  comercial: ["indicacoes", "vendas", "clientes"],
  implementacao: ["implementacao"],
  programador: ["programador"],
  suporte: ["suporte"],
};

/** abasPermitidas() do original (financeiro.html:3260): admin vê todas; sem papel, nenhuma. */
export function abasPermitidas(papeis: Papel[]): Aba[] {
  if (papeis.length === 0) return [];
  if (papeis.includes("admin")) return ABAS.map((a) => a.id);
  const set = new Set<Aba>(["tarefas"]);
  for (const p of papeis)
    for (const a of ABAS_DO_PAPEL[p as Exclude<Papel, "admin">] ?? []) set.add(a);
  return ABAS.map((a) => a.id).filter((id) => set.has(id));
}

// ---------------------------------------------------------------------------
// Linhas do banco (snake_case). numeric/bigint chegam como number pelo PostgREST.
// ---------------------------------------------------------------------------

interface Base {
  id: string;
  id_origem: string | null;
  extras: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
  deleted_at: string | null;
}

export type Situacao = "Vigente" | "Sem plano" | "Cancelado" | "Sócio";

// ---------------------------------------------------------------------------
// Histórico do atendimento (Lote H): diário de 15 dias, tentativas de contato
// e as "voltas" entre implementação e programador. Tipos genéricos porque os
// campos do diário mudam por contexto (CTX_ATEND em dados-atendimento.ts).
// ---------------------------------------------------------------------------

/** Um dia do diário: bolsa de campos livres (o conjunto exato vem de CAMPOS_DIARIO por contexto). */
export interface DiaRegistro {
  [campo: string]: string | undefined;
}

/** Tentativa de contato sem sucesso — financeiro-original:2935-2963. */
export interface Tentativa {
  id: string;
  quando: string;
  canal: string;
  por: string;
  obs: string;
}

/** Item de `retornos`/`extras.devolucoes`/`extras.entregas` — financeiro-original:2251-2261. */
export interface RegistroVolta {
  em: string;
  motivo?: string;
  obs?: string;
  por?: string;
}

/**
 * Mesmos 6 tons de `ui-gestao.tsx` (`TomSelo`), duplicado aqui de propósito: este arquivo não importa
 * React/framer-motion (comentário no topo), para poder ser usado por `logica-atendimento.ts` no teste de
 * node (`TESTES-CALCULOS`). Os dois tipos são estruturalmente iguais — TypeScript aceita um no lugar do
 * outro sem conversão.
 */
export type TomSelo = "neutro" | "ok" | "aviso" | "erro" | "info" | "aurora";

export interface Cliente extends Base {
  profile_id: string | null;
  nome: string;
  email: string | null;
  telefone: string | null;
  fechamento: string | null;
  implementacao: string | null;
  setup: number | null;
  mensalidade: number | null;
  inicio_cobranca: string | null;
  situacao: Situacao | null;
  suporte: string | null;
  implementador: string | null;
  obs: string | null;
  /** Pasta do cliente no Drive (só https; grava pela função gestao_cliente_definir_drive). */
  link_drive: string | null;
}

export interface Parcela extends Base {
  cliente_id: string;
  descricao: string | null;
  valor: number | null;
  vencimento: string | null;
  pago_em: string | null;
}

export interface Mensalidade extends Base {
  cliente_id: string;
  n: number;
  pago_em: string | null;
  valor_recebido: number | null;
}

/** Valor digitado; a exibição usa AtividadeFinal (digitado sobrepõe o uso calculado). */
export interface AtividadeDigitada extends Base {
  cliente_id: string;
  competencia: string;
  tokens: number | null;
  leads: number | null;
}

/** Retorno de gestao_atividade_uso (03-GESTAO.sql:318). */
export interface AtividadeUso {
  cliente_id: string;
  competencia: string;
  tokens_uso: number;
  leads_uso: number;
  tokens_manual: number | null;
  leads_manual: number | null;
  tokens_final: number;
  leads_final: number;
}

/** O que os cálculos consomem: um total por cliente e mês. */
export interface AtividadeFinal {
  cliente_id: string;
  competencia: string;
  tokens: number;
  leads: number;
}

export interface Vendedor extends Base {
  nome: string;
  codigo: string | null;
  whatsapp: string | null;
  email: string | null;
  tipo: string | null;
  ativo: boolean | null;
}

export interface Venda extends Base {
  vendedor_id: string | null;
  vendedor_nome: string | null;
  data_venda: string | null;
  plano: string | null;
  setup: number | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  empresa: string | null;
  nicho: string | null;
  whatsapp: string | null;
  email: string | null;
  status: string | null;
  origem: string | null;
  obs: string | null;
  indicacao_id: string | null;
  comprovante: Record<string, unknown> | null;
  anexos: Array<Record<string, unknown>> | null;
  submission_id: string | null;
  consentimento_texto: string | null;
  consentimento_em: string | null;
}

export interface Indicador extends Base {
  codigo: string | null;
}

export interface Indicacao extends Base {
  indicador_id: string | null;
  referrer_name: string | null;
  referrer_code: string | null;
  lead_nome: string | null;
  lead_whatsapp: string | null;
  lead_email: string | null;
  empresa: string | null;
  nicho: string | null;
  melhor_horario: string | null;
  data_preferida: string | null;
  status: string | null;
  necessidade: string | null;
  obs: string | null;
  origem: string | null;
  responsavel: string | null;
  inicio: string | null;
  inicio_hora: string | null;
  iniciado_em: string | null;
  enviado_vendas_em: string | null;
  venda_id: string | null;
  tentativas: Tentativa[] | null;
  dias: Record<string, DiaRegistro> | null;
  /** Dia de calendário da indicação, sem fuso (decisão 4). */
  data_indicacao: string | null;
  consentimento_texto: string | null;
  consentimento_em: string | null;
}

export interface Funcionario extends Base {
  nome: string;
  cargo: string | null;
  whatsapp: string | null;
  email: string | null;
  ativo: boolean | null;
  area: string | null;
}

export interface Implementacao extends Base {
  cliente_id: string | null;
  cliente_nome: string | null;
  venda_id: string | null;
  status: string | null;
  responsavel: string | null;
  programador: string | null;
  suporte_responsavel: string | null;
  enviado_em: string | null;
  inicio: string | null;
  inicio_hora: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  enviado_prog_em: string | null;
  prog_iniciado_em: string | null;
  prog_concluido_em: string | null;
  prog_inicio: string | null;
  prog_inicio_hora: string | null;
  validacao_desde: string | null;
  validado_em: string | null;
  call_validacao: string | null;
  call_validacao_hora: string | null;
  ultima_volta: string | null;
  obs_final: string | null;
  suporte_auto: boolean | null;
  suporte_removido: boolean | null;
  oculto_prog: boolean | null;
  oculto_impl: boolean | null;
  /**
   * SÓ do lado implementação (array `{id,quando,canal,por,obs}[]`, confirmado no banco real — auditoria
   * de 2026-09-22). O lado do programador fica em `extras.tentativasProg` (ver logica-atendimento.ts).
   */
  tentativas: Tentativa[] | null;
  /**
   * SÓ do lado implementação (chaves "1".."15"). O diário do programador fica em `extras.diasProg`
   * (mesmo dado do backup real e do conversor `mapa-colecoes.ts`; ver logica-atendimento.ts).
   */
  dias: Record<string, DiaRegistro> | null;
  /** "Implementação retornou ao programador" — só esse sentido (o outro vai em extras.devolucoes/entregas). */
  retornos: RegistroVolta[] | null;
}

/** Reunião de implementação (impl_id aponta para implementação OU indicação, area = 'ind'). */
export interface ImplReuniao extends Base {
  impl_id: string | null;
  area: string | null;
  cliente_id: string | null;
  data: string | null;
  hora: string | null;
  responsavel: string | null;
  tipo: string | null;
  status: string | null;
  resumo: string | null;
  motivo: string | null;
  remarcada_para: string | null;
  origem_id: string | null;
}

export interface SuporteAtend extends Base {
  cliente_id: string | null;
  cliente_nome: string | null;
  impl_id: string | null;
  enviado_em: string | null;
  status: string | null;
  responsavel: string | null;
  suporte_responsavel: string | null;
  inicio: string | null;
  inicio_hora: string | null;
  concluido_em: string | null;
  obs_final: string | null;
  origem: string | null;
  tentativas: Tentativa[] | null;
  dias: Record<string, DiaRegistro> | null;
  retornos: RegistroVolta[] | null;
}

export type StatusChamado = "aberto" | "andamento" | "aguardando_cliente" | "aguardando_equipe" | "resolvido" | "nao_resolvido";
export type PrioridadeChamado = "alta" | "media" | "baixa";
export type TipoEventoChamado =
  | "criacao" | "nota_interna" | "contato_cliente" | "status" | "responsavel" | "prioridade" | "categoria"
  | "escalonamento" | "devolucao" | "fechamento" | "reabertura";

/**
 * gestao_chamados (plano-integracao/2026-09-25/chamados/CHAMADOS.sql). A tela só lê; grava pelas funções gestao_chamado_*.
 * Não estende `Base`: a tabela não tem id_origem/extras/origem_id e tem deleted_at.
 */
export interface Chamado {
  id: string;
  criado_em: string;
  atualizado_em: string;
  deleted_at: string | null;
  numero: number;
  cliente_id: string;
  cliente_nome: string;
  atend_id: string | null;
  titulo: string;
  relato: string;
  canal: string;
  relatado_por: string | null;
  categoria: string;
  prioridade: PrioridadeChamado;
  status: StatusChamado;
  responsavel: string | null;
  passou_pd: boolean;
  aberto_em: string;
  primeira_resposta_em: string | null;
  status_desde: string;
  resolvido_em: string | null;
  causa: string | null;
  solucao: string | null;
  resultado: string | null;
  importado: boolean;
}

/** gestao_chamado_eventos: a linha do tempo. Nunca muda depois de gravada. */
export interface EventoChamado {
  id: string;
  chamado_id: string;
  tipo: TipoEventoChamado;
  texto: string | null;
  valor_antigo: string | null;
  valor_novo: string | null;
  aconteceu_em: string;
  registrado_em: string;
  autor_uid: string | null;
  autor_nome: string;
  origem: "app" | "importado" | "sql" | "terminal";
}

/** Reunião de suporte com o cliente. */
export interface Reuniao extends Base {
  cliente_id: string | null;
  atend_id: string | null;
  data: string | null;
  hora: string | null;
  responsavel: string | null;
  tipo: string | null;
  status: string | null;
  resumo: string | null;
  motivo: string | null;
  remarcada_para: string | null;
  origem_id: string | null;
}

export type StatusTarefa = "afazer" | "andamento" | "bloqueada" | "concluida";
export type PrioridadeTarefa = "alta" | "media" | "baixa";

export interface Tarefa extends Base {
  titulo: string;
  descricao: string | null;
  responsavel: string | null;
  prazo: string | null;
  prioridade: PrioridadeTarefa | null;
  area: string | null;
  status: StatusTarefa | null;
  bloqueio: string | null;
  cliente_id: string | null;
  impl_id: string | null;
  reuniao_id: string | null;
  origem_key: string | null;
  concluido_em: string | null;
}

export interface ReuniaoEquipe extends Base {
  titulo: string | null;
  tipo: string | null;
  data: string | null;
  hora: string | null;
  duracao: string | null;
  participantes: string[] | null;
  pauta: string | null;
  ata: string | null;
  status: "Agendada" | "Concluída" | "Cancelada" | null;
  motivo: string | null;
}

export interface Acesso {
  id: string;
  papeis: Papel[];
  pessoa: string | null;
  por_id: string | null;
  atualizado_em: string;
}

export interface PedidoAcesso {
  id: string;
  pedido_em: string;
}

/** Só id, nome e avatar (gestao_perfis / gestao_buscar_perfis): sem e-mail nem telefone. */
export interface PerfilBasico {
  id: string;
  nome: string | null;
  avatar_url: string | null;
  dono?: boolean;
}

export interface PagamentoLog {
  id: string;
  tabela: string;
  linha_id: string;
  cliente_id: string | null;
  acao: "apagou" | "desmarcou" | "alterou";
  antes: Record<string, unknown>;
  depois: Record<string, unknown>;
  por: string | null;
  em: string;
}

/** Tudo o que o app mantém em memória. Vazio = a RLS não deixou ler (ou não há linhas). */
export interface Dados {
  clientes: Cliente[];
  parcelas: Parcela[];
  mensalidades: Mensalidade[];
  atividade: AtividadeFinal[];
  vendedores: Vendedor[];
  vendas: Venda[];
  indicadores: Indicador[];
  indicacoes: Indicacao[];
  funcionarios: Funcionario[];
  implementacoes: Implementacao[];
  implReunioes: ImplReuniao[];
  suporteAtend: SuporteAtend[];
  chamados: Chamado[];
  reunioes: Reuniao[];
  tarefas: Tarefa[];
  reunioesEquipe: ReuniaoEquipe[];
  /** gestao_config: chave → valor (equipe, rodizioSuporte, retencao). */
  config: Record<string, unknown>;
  acessos: Acesso[];
  pedidos: PedidoAcesso[];
}

export const DADOS_VAZIOS: Dados = {
  clientes: [],
  parcelas: [],
  mensalidades: [],
  atividade: [],
  vendedores: [],
  vendas: [],
  indicadores: [],
  indicacoes: [],
  funcionarios: [],
  implementacoes: [],
  implReunioes: [],
  suporteAtend: [],
  chamados: [],
  reunioes: [],
  tarefas: [],
  reunioesEquipe: [],
  config: {},
  acessos: [],
  pedidos: [],
};

/** Cada chave de `Dados` é uma "fonte" carregável do banco (atividade vem de função, não de tabela). */
export type ChaveDados = keyof Dados;

// ---------------------------------------------------------------------------
// Quem lê e quem escreve (espelho da RLS; o banco é quem decide de verdade)
// FONTE: comentário "Matriz" em 03-GESTAO.sql:525-535, mais FLUXO-EMPURRADO.sql e PERMISSOES-IGUAL-ARTEFATO.sql
// (plano-integracao/2026-09-24/): o app só pode ir ao ar DEPOIS de os dois SQLs estarem aplicados.
// ---------------------------------------------------------------------------

type Quem = Papel[] | "qualquer";

export const LEITURA: Record<ChaveDados, Quem> = {
  clientes: ["financeiro", "comercial"],
  parcelas: ["financeiro"],
  mensalidades: ["financeiro"],
  atividade: ["financeiro"],
  vendedores: ["financeiro", "comercial"],
  vendas: ["financeiro", "comercial"],
  indicadores: ["comercial"],
  indicacoes: ["comercial"],
  funcionarios: "qualquer",
  implementacoes: ["implementacao", "programador", "suporte"],
  implReunioes: ["implementacao", "programador", "comercial"], // comercial: só as reuniões com indicado (area = "ind")
  suporteAtend: ["implementacao", "suporte"],
  chamados: ["suporte", "programador", "financeiro", "comercial"], // P&D: só os escalados; financeiro/comercial: só leitura (RLS chamados_le)
  reunioes: ["suporte", "financeiro"], // PERMISSOES-IGUAL-ARTEFATO.sql (Painel do Financeiro)
  tarefas: "qualquer",
  reunioesEquipe: "qualquer",
  config: "qualquer",
  acessos: ["admin"],
  pedidos: ["admin"],
};

export const ESCRITA: Partial<Record<ChaveDados, Quem>> = {
  clientes: ["financeiro", "comercial"],
  parcelas: ["financeiro"],
  mensalidades: ["financeiro"],
  atividade: ["financeiro"],
  vendedores: ["comercial", "financeiro"], // FLUXO-EMPURRADO.sql (B4)
  vendas: ["comercial", "financeiro"], // FLUXO-EMPURRADO.sql (B4)
  indicadores: ["comercial"],
  indicacoes: ["comercial"],
  funcionarios: ["implementacao", "programador"], // PERMISSOES-IGUAL-ARTEFATO.sql
  implementacoes: ["implementacao", "programador"], // o Suporte só "Exclui do suporte", pela função gestao_excluir_do_suporte
  implReunioes: ["implementacao", "programador", "comercial"], // comercial: só area = "ind"
  suporteAtend: ["implementacao", "suporte"],
  chamados: ["suporte"], // grava só pelas funções gestao_chamado_*
  reunioes: ["suporte"],
  tarefas: "qualquer", // PERMISSOES-IGUAL-ARTEFATO.sql (artefato :3239-3243)
  reunioesEquipe: "qualquer", // PERMISSOES-IGUAL-ARTEFATO.sql
  config: ["suporte"], // suporte: só as chaves "equipe" e "rodizioSuporte" (a RLS barra o resto)
  acessos: ["admin"],
  pedidos: ["admin"],
};

function passa(papeis: Papel[], quem: Quem | undefined): boolean {
  if (papeis.length === 0 || !quem) return false;
  if (papeis.includes("admin") || quem === "qualquer") return true;
  return quem.some((p) => papeis.includes(p));
}

export const podeLer = (papeis: Papel[], k: ChaveDados): boolean => passa(papeis, LEITURA[k]);
export const podeEscrever = (papeis: Papel[], k: ChaveDados): boolean => passa(papeis, ESCRITA[k]);

// ---------------------------------------------------------------------------
// Contexto que a casca entrega a cada aba (contrato para quem preenche as abas)
// ---------------------------------------------------------------------------

export interface PropsAba {
  dados: Dados;
  papeis: Papel[];
  /** Mês de referência, YYYY-MM (mesmo formato do app Financeiro). */
  mes: string;
  setMes: (m: string) => void;
  t: ToastApi;
  /** Recarrega do banco as chaves informadas (ou tudo). Chame depois de CONFIRMAR a gravação. */
  recarregar: (chaves?: ChaveDados[]) => Promise<void>;
  /** id do usuário logado (auth), para "por" e para "minha pessoa". */
  uid: string | null;
  /**
   * Nome de quem está logado, para assinar encaminhamentos (pedido do Diego, 2026-09-22: "tudo isso
   * ter registro"). `null` quando o perfil não tem nome — aí grava-se sem assinatura, nunca inventada.
   */
  meuNome: string | null;
}

// ---------------------------------------------------------------------------
// Toast helper (resolve em runtime — mesmo padrão de apps/user/financeiro/tipos.ts:40-49)
// ---------------------------------------------------------------------------

export interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

export function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {}, info: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseBruto = any;

/** Ação ainda não implementada (esqueleto da etapa 1): avisa em vez de fingir que funcionou. */
export const emBreve = (t: ToastApi) => () => t.info("Esta função entra na próxima etapa.");

// ---------------------------------------------------------------------------
// Datas: calendário como texto AAAA-MM-DD, nunca instante (decisão 4)
// ---------------------------------------------------------------------------

const p2 = (n: number): string => String(n).padStart(2, "0");

/** "AAAA-MM-DD" → Date à meia-noite LOCAL (sem UTC). Inválida → null. */
export function parseData(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ymd(d: Date | null): string {
  return d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : "";
}

export function ym(d: Date | null): string {
  return d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}` : "";
}

export const inicioDoMes = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);

/** addMonths do original (financeiro.html:444): 31/jan + 1 mês = 28/fev (último dia), não 03/mar. */
export function addMeses(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  return x.getDate() !== d.getDate() ? new Date(d.getFullYear(), d.getMonth() + n + 1, 0) : x;
}

/** Hoje à meia-noite local. */
export function hojeLocal(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "2026-07" → Date 2026-07-01 local. */
export function mesParaData(mes: string): Date {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1);
}

/** Mês corrente em BRT no formato YYYY-MM (apps/user/financeiro/tipos.ts:69). */
export function mesAtual(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** Soma delta meses a um YYYY-MM (apps/user/financeiro/tipos.ts:74). */
export function somarMes(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "2026-07" → "julho de 2026" */
export const rotuloMes = (mes: string): string => {
  const [ano, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${ano}`;
};
export const nomeMes = (d: Date): string => MESES[d.getMonth()];
export const mesLongo = (d: Date): string => `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
export const mesCurto = (d: Date): string =>
  `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;

/** "2026-09-21" → "21/09/2026" sem passar por Date (sem fuso). Vazio → "—". */
export function dataBR(s: string | null | undefined): string {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** timestamptz → "21/09/2026 14:30" (aqui o instante importa: usa o fuso do navegador). */
export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Formatação de dinheiro (mesmo idioma de apps/user/financeiro/tipos.ts:58 e lib/moeda.ts)
// ---------------------------------------------------------------------------

export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** money() do original (financeiro.html:453): sem centavos, para KPI e gráfico. */
export function formatBRLInteiro(n: number): string {
  return (n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** kshort() do original (financeiro.html:455): 1.2k, 3M. Eixo de gráfico. */
export function abreviar(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (a >= 1000) {
    const k = Math.round(v / 100) / 10;
    return `${k % 1 ? k.toFixed(1).replace(".", ",") : String(k)}k`;
  }
  return String(Math.round(v));
}

/** Número inteiro com milhar (tokens, leads). */
export const formatInt = (n: number): string => (n || 0).toLocaleString("pt-BR");

// ---------------------------------------------------------------------------
// Estilo base de input (idêntico a apps/user/financeiro/tipos.ts:97-106)
// ---------------------------------------------------------------------------

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 12,
  background: "oklch(0.18 0.06 280 / 0.4)",
  color: "oklch(0.98 0 0)",
  border: "1px solid oklch(0.98 0 0 / 0.1)",
  borderRadius: 10,
  outline: "none",
};

// ---------------------------------------------------------------------------
// Listas fixas do original (rótulos)
// ---------------------------------------------------------------------------

export const STATUS_REUNIAO = ["Agendada", "Concluída", "Cancelada", "Remarcada"] as const; // :438
export const TIPOS_REUNIAO = [
  "Onboarding",
  "Implementação",
  "Acompanhamento",
  "Treinamento",
  "Resolução de problema",
  "Renovação",
] as const; // :439
/** Tipos de reunião de IMPLEMENTAÇÃO (`gestao_impl_reunioes`, area "impl"). Artefato :4106. */
export const TIPOS_IMPL_REUNIAO = [
  "Kickoff",
  "Coleta de informações",
  "Configuração",
  "Treinamento",
  "Validação",
  "Entrega",
] as const;
/** Tipos de reunião com um INDICADO (`gestao_impl_reunioes`, area "ind"). Artefato :2211. */
export const TIPOS_IND_REUNIAO = [
  "Primeiro contato",
  "Apresentação",
  "Proposta",
  "Negociação",
  "Fechamento",
] as const;
/** Tipos de reunião da EQUIPE (`gestao_reunioes_equipe`). Artefato :3423. */
export const TIPOS_REUNIAO_EQUIPE = [
  "Daily",
  "Semanal de implementação",
  "Alinhamento de suporte",
  "Planejamento",
  "1:1",
  "Retrospectiva",
  "Outro",
] as const;
/** Reunião de equipe não tem "Remarcada": remarcar é editar o dia. Artefato :3424. */
export const STATUS_REUNIAO_EQUIPE = ["Agendada", "Concluída", "Cancelada"] as const;

export const STATUS_INDICACAO: Array<[string, string]> = [
  ["novo", "Novo"],
  ["contato", "Em contato"],
  ["reuniao", "Reunião marcada"],
  ["fechou", "Fechou"],
  ["perdido", "Perdido"],
]; // :1072
export const STATUS_VENDA: Array<[string, string]> = [
  ["negociacao", "Em negociação"],
  ["pendente", "Aguardando conferência"],
  ["conferida", "Conferida"],
  ["recusada", "Recusada"],
]; // :1578
export const PLANOS: Record<string, { nome: string; leads: string; valor: number }> = {
  vip: { nome: "VIP", leads: "até 10 mil leads", valor: 12000 },
  profissional: { nome: "Profissional", leads: "até 5 mil leads", valor: 9000 },
  basico: { nome: "Básico", leads: "até 1 mil leads", valor: 3000 },
}; // :1572
export const STATUS_TAREFA: Array<[StatusTarefa, string]> = [
  ["afazer", "A fazer"],
  ["andamento", "Em andamento"],
  ["bloqueada", "Bloqueada"],
  ["concluida", "Concluída"],
]; // :3420
export const PRIORIDADES: Array<[PrioridadeTarefa, string]> = [
  ["alta", "Alta"],
  ["media", "Média"],
  ["baixa", "Baixa"],
]; // :3421
export const AREAS_TAREFA: Array<[string, string]> = [
  ["implementacao", "Implementação"],
  ["programador", "P&D"],
  ["suporte", "Suporte"],
  ["comercial", "Comercial"],
  ["geral", "Geral"],
]; // :3422

/**
 * Regras puras dos chamados de suporte (sem React, sem banco) — spec plano-integracao/2026-09-25/PROPOSTA-SUPORTE-CHAMADOS.md.
 * O banco (CHAMADOS.sql) é quem garante; aqui só se espelha para a tela mostrar o botão certo e a mensagem antes de chamar.
 */
import type { Chamado, EventoChamado, Papel, PrioridadeChamado, StatusChamado, TomSelo } from "./tipos";

export const ROTULO_STATUS_CHAMADO: Record<StatusChamado, string> = {
  aberto: "Aberto",
  andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  aguardando_equipe: "Com o P&D",
  resolvido: "Resolvido",
  nao_resolvido: "Não resolvido",
};
export const TOM_STATUS_CHAMADO: Record<StatusChamado, TomSelo> = {
  aberto: "info",
  andamento: "aurora",
  aguardando_cliente: "aviso",
  aguardando_equipe: "aviso",
  resolvido: "ok",
  nao_resolvido: "erro",
};
export const ROTULO_PRIORIDADE: Record<PrioridadeChamado, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const TOM_PRIORIDADE: Record<PrioridadeChamado, TomSelo> = { alta: "erro", media: "aviso", baixa: "neutro" };
/** Mesma lista do check chamados_categoria. */
export const CATEGORIAS_CHAMADO: Array<[string, string]> = [
  ["agente", "Agente / respostas"], ["whatsapp", "WhatsApp / conexão"], ["acesso", "Acesso e permissões"],
  ["erro", "Erro na plataforma"], ["integracao", "Integração"], ["dados", "Dados (correção/perda)"],
  ["duvida", "Dúvida / treinamento"], ["melhoria", "Sugestão de melhoria"], ["seguranca", "Segurança"], ["outro", "Outro"],
];
/** Mesma lista do check chamados_canal. */
export const CANAIS_CHAMADO: Array<[string, string]> = [
  ["whatsapp", "WhatsApp"], ["chat", "Chat"], ["telefone", "Telefone"], ["email", "E-mail"],
  ["terminal", "Terminal"], ["reuniao", "Reunião"], ["outro", "Outro"],
];
const rotuloDe = (lista: Array<[string, string]>, k: string | null) => lista.find(([c]) => c === k)?.[1] ?? k ?? "—";
export const rotuloCategoria = (k: string) => rotuloDe(CATEGORIAS_CHAMADO, k);
export const rotuloCanal = (k: string) => rotuloDe(CANAIS_CHAMADO, k);

const FECHADOS: StatusChamado[] = ["resolvido", "nao_resolvido"];
export const estaFechado = (c: Pick<Chamado, "status">) => FECHADOS.includes(c.status);
/** Código do chamado (spec 7e): o mesmo que o terminal usa no dossiê. */
export const numeroChamado = (n: number) => `CH-${String(n).padStart(4, "0")}`;

const ESPERA_CLIENTE_MS = 48 * 3600e3;

export function precisaAtencao(c: Chamado, agora: Date): boolean {
  return motivoAtencao(c, agora) !== null;
}
export function motivoAtencao(c: Chamado, agora: Date): string | null {
  if (estaFechado(c)) return null;
  if (c.status === "aguardando_cliente" && agora.getTime() - new Date(c.status_desde).getTime() > ESPERA_CLIENTE_MS) {
    const dias = Math.floor((agora.getTime() - new Date(c.status_desde).getTime()) / 86400e3);
    return `Cliente sem responder há ${dias} dias`;
  }
  if (!c.responsavel) return "Sem responsável";
  return null;
}

export function tempoDesde(iso: string, agora: Date): string {
  const min = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 48) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} dias`;
}

export interface FiltroChamados {
  status: "abertos" | "fechados" | "todos" | StatusChamado;
  prioridade: "" | PrioridadeChamado;
  responsavel: string;
  clienteId: string;
  busca: string;
}
export const FILTRO_PADRAO: FiltroChamados = { status: "abertos", prioridade: "", responsavel: "", clienteId: "", busca: "" };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarChamados(lista: Chamado[], f: FiltroChamados): Chamado[] {
  const busca = semAcento(f.busca.trim());
  // "CH-0003", "#0003" e "3" buscam pelo número; o prefixo só sai quando o resto é número (senão "chat" viraria "at").
  const num = busca.match(/^(?:ch-?|#)?0*(\d+)$/)?.[1] ?? null;
  return lista.filter((c) => {
    if (f.status === "abertos" && estaFechado(c)) return false;
    if (f.status === "fechados" && !estaFechado(c)) return false;
    if (!["abertos", "fechados", "todos"].includes(f.status) && c.status !== f.status) return false;
    if (f.prioridade && c.prioridade !== f.prioridade) return false;
    if (f.responsavel && c.responsavel !== f.responsavel) return false;
    if (f.clienteId && c.cliente_id !== f.clienteId) return false;
    if (num !== null) return String(c.numero) === num;
    if (busca) {
      return semAcento(`${c.titulo} ${c.cliente_nome} ${c.relato}`).includes(busca);
    }
    return true;
  });
}

const PESO_PRIORIDADE: Record<PrioridadeChamado, number> = { alta: 0, media: 1, baixa: 2 };
export function ordenarChamados(lista: Chamado[], agora: Date): Chamado[] {
  return [...lista].sort((a, b) =>
    Number(precisaAtencao(b, agora)) - Number(precisaAtencao(a, agora))
    || PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade]
    || a.aberto_em.localeCompare(b.aberto_em));
}

export function chamadosDoCliente(lista: Chamado[], clienteId: string): Chamado[] {
  return lista.filter((c) => c.cliente_id === clienteId).sort((a, b) => b.aberto_em.localeCompare(a.aberto_em) || b.numero - a.numero);
}
export function contagemDoCliente(lista: Chamado[], clienteId: string): { abertos: number; fechados: number } {
  const doCliente = lista.filter((c) => c.cliente_id === clienteId);
  const fechados = doCliente.filter(estaFechado).length;
  return { abertos: doCliente.length - fechados, fechados };
}

export type AcaoChamado = "registrar" | "editar" | "escalar" | "devolver" | "resolver" | "nao_resolvido" | "reabrir";

/** Espelho das regras de gestao_chamado_registrar/mudar. Admin passa em gestao_tem_papel, então conta como suporte. */
export function acoesDoChamado(c: Chamado, papeis: Papel[]): AcaoChamado[] {
  const suporte = papeis.includes("admin") || papeis.includes("suporte");
  if (suporte) {
    if (estaFechado(c)) return ["reabrir"];
    return ["registrar", "editar", c.status === "aguardando_equipe" ? "devolver" : "escalar", "resolver", "nao_resolvido"];
  }
  if (papeis.includes("programador") && c.passou_pd && c.status === "aguardando_equipe") return ["registrar", "devolver"];
  return [];
}

export interface CamposAcao { motivo?: string; causa?: string; solucao?: string; resultado?: string }
const vazio = (s?: string) => !s || !s.trim();
export function validarAcao(acao: AcaoChamado, v: CamposAcao): string | null {
  if (acao === "escalar" && vazio(v.motivo)) return "Escreva o motivo do escalonamento.";
  if (acao === "devolver" && vazio(v.motivo)) return "Escreva o que foi feito antes de devolver.";
  if (acao === "reabrir" && vazio(v.motivo)) return "Escreva o motivo da reabertura.";
  if (acao === "resolver" && (vazio(v.causa) || vazio(v.solucao) || vazio(v.resultado))) return "Para resolver, preencha causa, solução e resultado.";
  if (acao === "nao_resolvido" && vazio(v.resultado)) return "Escreva a justificativa.";
  return null;
}

const ROTULO_TIPO: Record<string, string> = {
  criacao: "Chamado aberto", nota_interna: "Nota interna", contato_cliente: "Contato com o cliente",
  escalonamento: "Escalado para o P&D", devolucao: "Devolvido ao Suporte", fechamento: "Chamado fechado", reabertura: "Chamado reaberto",
};
export function rotuloEvento(e: EventoChamado): string {
  const nada = (v: string | null) => v ?? "ninguém";
  if (e.tipo === "status") return `Status: ${ROTULO_STATUS_CHAMADO[e.valor_antigo as StatusChamado] ?? e.valor_antigo} → ${ROTULO_STATUS_CHAMADO[e.valor_novo as StatusChamado] ?? e.valor_novo}`;
  if (e.tipo === "responsavel") return `Responsável: ${nada(e.valor_antigo)} → ${nada(e.valor_novo)}`;
  if (e.tipo === "prioridade") return `Prioridade: ${ROTULO_PRIORIDADE[e.valor_antigo as PrioridadeChamado] ?? e.valor_antigo} → ${ROTULO_PRIORIDADE[e.valor_novo as PrioridadeChamado] ?? e.valor_novo}`;
  if (e.tipo === "categoria") return `Categoria: ${rotuloCategoria(e.valor_antigo ?? "")} → ${rotuloCategoria(e.valor_novo ?? "")}`;
  return ROTULO_TIPO[e.tipo] ?? e.tipo;
}

/**
 * "Quando aconteceu" do registro (prova de tela, 25/09): o campo guarda só até o minuto; se a pessoa não mexeu nele, manda
 * null e o banco usa now() — senão uma nota feita no mesmo minuto da abertura ficava ANTES dela na linha do tempo.
 */
export function momentoDoRegistro(valorCampo: string, valorInicial: string): string | null {
  if (!valorCampo || valorCampo === valorInicial) return null;
  return new Date(valorCampo).toISOString();
}

/**
 * Revisão final I1 (25/09): se a tela nova estiver no ar e as tabelas de chamados ainda não (ou alguém rodar a VOLTA),
 * a leitura de gestao_chamados falha com "tabela não existe" — isso não pode derrubar a Gestão inteira. `codigo` vem
 * do ErroDados (dados.ts/traduz). Permissão, rede e outros erros continuam sendo erro.
 */
export function tabelaDeChamadosAusente(e: unknown): boolean {
  const codigo = e && typeof e === "object" ? (e as { codigo?: unknown }).codigo : undefined;
  return codigo === "PGRST205" || codigo === "42P01";
}

/**
 * Cliente "Em dia" (25/09, Adrian: "onde fica o cliente que está tudo ok?"): tem acompanhamento de 15 dias e todos estão
 * concluídos, e nenhum chamado está aberto. Se surgir algo depois, abre-se um chamado — o acompanhamento não reabre.
 */
export function clienteEmDia(acompanhamentos: Array<{ status: string | null }>, chamadosDoCliente: Chamado[]): boolean {
  if (acompanhamentos.length === 0) return false;
  if (acompanhamentos.some((a) => a.status !== "concluida")) return false;
  return chamadosDoCliente.every(estaFechado);
}

/** Texto gravado em obs_final ao concluir um acompanhamento que não precisou acontecer. Motivo vazio = null (recusa). */
export function obsConcluidoSemAcompanhamento(motivo: string, por: string | null): string | null {
  const m = motivo.trim();
  if (!m) return null;
  return `Concluído sem acompanhamento${por ? ` (por ${por})` : ""}: ${m}`;
}

/**
 * Pasta do cliente no Drive (25/09): espelho de gestao_cliente_definir_drive — o texto é aparado; vazio = apagar (ok);
 * senão tem de começar com https://, sem espaço e até 500 caracteres. null = ok; texto = mensagem para a pessoa.
 */
export function validarLinkDrive(texto: string): string | null {
  const v = texto.trim();
  if (!v) return null;
  if (!/^https:\/\/\S+$/.test(v) || v.length > 500) return "O link precisa começar com https:// (até 500 caracteres, sem espaços).";
  return null;
}
/** Quem edita o link do Drive: admin, programador e implementação (o banco confere de novo). */
export function podeEditarDrive(papeis: Papel[]): boolean {
  return papeis.some((p) => p === "admin" || p === "programador" || p === "implementacao");
}

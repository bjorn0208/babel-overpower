/**
 * Chamados de suporte: leitura da linha do tempo e as 5 funções do banco (CHAMADOS.sql).
 * A tela nunca faz insert/update nas tabelas de chamado: a RLS não deixa, e é de propósito (spec, "Garantias no banco").
 * Mensagens de erro do banco começam com "gestao: …"; saem para a pessoa sem o prefixo.
 */
import { sb, traduz, ErroDados } from "./dados";
import type { EventoChamado, PrioridadeChamado, StatusChamado } from "./tipos";

const semPrefixo = (e: unknown, padrao: string): Error => {
  const msg = (e as { message?: string })?.message ?? "";
  if (msg.startsWith("gestao: ")) {
    const t = msg.slice(8);
    return new ErroDados(t.charAt(0).toUpperCase() + t.slice(1) + ".");
  }
  return traduz(e as never, padrao);
};

export async function lerEventos(chamadoId: string): Promise<EventoChamado[]> {
  const { data, error } = await sb()
    .from("gestao_chamado_eventos")
    .select("*")
    .eq("chamado_id", chamadoId)
    .order("aconteceu_em", { ascending: true })
    .order("registrado_em", { ascending: true });
  if (error) throw semPrefixo(error, "Não consegui carregar a linha do tempo.");
  return (data ?? []) as EventoChamado[];
}

export async function clientesParaChamado(): Promise<Array<{ id: string; nome: string }>> {
  const { data, error } = await sb().rpc("gestao_chamado_clientes");
  if (error) throw semPrefixo(error, "Não consegui carregar os clientes.");
  return (data ?? []) as Array<{ id: string; nome: string }>;
}

export interface NovoChamado {
  clienteId: string; titulo: string; relato: string; canal: string; relatadoPor: string;
  categoria: string; prioridade: PrioridadeChamado; responsavel: string; atendId?: string | null;
}
export async function abrirChamado(n: NovoChamado): Promise<string> {
  const { data, error } = await sb().rpc("gestao_chamado_abrir", {
    p_cliente_id: n.clienteId, p_titulo: n.titulo, p_relato: n.relato, p_canal: n.canal, p_relatado_por: n.relatadoPor,
    p_categoria: n.categoria, p_prioridade: n.prioridade, p_responsavel: n.responsavel, p_atend_id: n.atendId ?? null,
  });
  if (error) throw semPrefixo(error, "Não consegui abrir o chamado.");
  if (typeof data !== "string") throw new ErroDados("Não consegui abrir o chamado.");
  return data;
}

export async function registrarNoChamado(
  chamadoId: string, tipo: "nota_interna" | "contato_cliente", texto: string, aconteceuEm?: string | null,
): Promise<void> {
  const { error } = await sb().rpc("gestao_chamado_registrar", {
    p_chamado: chamadoId, p_tipo: tipo, p_texto: texto, p_aconteceu_em: aconteceuEm ?? null,
  });
  if (error) throw semPrefixo(error, "Não consegui registrar.");
}

export interface MudancasChamado {
  status?: StatusChamado; responsavel?: string | null; prioridade?: PrioridadeChamado; categoria?: string;
  causa?: string; solucao?: string; resultado?: string;
}
export async function mudarChamado(chamadoId: string, mudancas: MudancasChamado, motivo?: string | null): Promise<void> {
  const { error } = await sb().rpc("gestao_chamado_mudar", { p_chamado: chamadoId, p_mudancas: mudancas, p_motivo: motivo ?? null });
  if (error) throw semPrefixo(error, "Não consegui salvar a mudança.");
}

/** Ficha do cliente (spec 7d): o banco confere quem pode ver e já devolve SEM valores financeiros. */
export interface FichaCliente {
  cliente: { id: string; nome: string; email: string | null; telefone: string | null; situacao: string | null; fechamento: string | null;
    implantacao: string | null; implementador: string | null; suporte: string | null; obs: string | null; link_drive: string | null };
  implementacoes: Array<{ id: string; status: string | null; responsavel: string | null; programador: string | null; enviado_em: string | null;
    iniciado_em: string | null; concluido_em: string | null; validado_em: string | null; obs_final: string | null }>;
  acompanhamentos: Array<{ id: string; status: string | null; responsavel: string | null; inicio: string | null; concluido_em: string | null; obs_final: string | null }>;
}
export async function lerFicha(clienteId: string): Promise<FichaCliente> {
  const { data, error } = await sb().rpc("gestao_chamado_ficha", { p_cliente_id: clienteId });
  if (error) throw semPrefixo(error, "Não consegui carregar a ficha do cliente.");
  return data as FichaCliente;
}

/** Pasta do cliente no Drive (spec 7): só admin/programador/implementação; texto vazio apaga. O banco valida de novo. */
export async function definirLinkDrive(clienteId: string, link: string): Promise<void> {
  const { error } = await sb().rpc("gestao_cliente_definir_drive", { p_cliente_id: clienteId, p_link: link });
  if (error) throw semPrefixo(error, "Não consegui salvar o link do Drive.");
}

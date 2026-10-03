/**
 * Dados do app Gestão: TODAS as consultas e gravações às tabelas `gestao_*` e às funções (RPC) do banco.
 *
 * Regras (decisões do Theus e AGENTS.md da frontend):
 *  - A RLS decide quem lê e quem escreve; a interface só esconde. Aqui não há SQL do cliente: só supabase-js
 *    com nomes de tabela e coluna fixos neste arquivo.
 *  - Leitura em janelas de 1000 linhas (limite duro do PostgREST) e com checagem de erro:
 *    falha vira ErroDados (a aba mostra toast), nunca "lista vazia" (padrão de apps/user/financeiro/Financeiro.tsx:41-67).
 *  - Gravação só é dada como feita depois que o banco devolve a linha: `.select()` e conferência de 1 linha.
 *    Com a RLS negando, o Postgres devolve 0 linhas SEM erro; por isso a conferência é obrigatória.
 *  - Apagar = marcar `deleted_at` (não há DELETE para ninguém; 03-GESTAO.sql:461). Linha paga nunca some (gatilho do histórico).
 *  - Este app NUNCA apaga config/vendas nem config/indicacao (decisão 3).
 */

import { supabase } from "@/integrations/supabase/client";
import { atividadeDeUso } from "./calculos";
import { tabelaDeChamadosAusente } from "./logica-chamados";
import { COLECAO_CONFIG, ErroValidacao, MAPA, docParaLinha, linhaParaDoc } from "./mapa-colecoes";
import {
  PAPEIS,
  podeLer,
  somarMes,
  type AtividadeFinal,
  type AtividadeUso,
  type ChaveDados,
  type Dados,
  type Papel,
  type PedidoAcesso,
  type PerfilBasico,
  type SupabaseBruto,
} from "./tipos";

export const sb = (): SupabaseBruto => supabase as SupabaseBruto;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export class ErroDados extends Error {
  codigo?: string;
  constructor(mensagem: string, codigo?: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

interface ErroPostgrest {
  message?: string;
  code?: string;
}

/** Traduz o erro do banco para uma frase que o usuário entende. O texto bruto vai só para o console. */
export function traduz(e: ErroPostgrest, padrao: string): ErroDados {
  console.error("[Gestão]", e.code ?? "", e.message ?? "");
  if (e.code === "42501") return new ErroDados("Você não tem permissão para isso.", e.code);
  if (e.code === "23505") return new ErroDados("Já existe um registro igual a este.", e.code);
  if (e.code === "23503")
    return new ErroDados(
      "Esse registro depende de outro que não existe (ou ainda não foi gravado).",
      e.code,
    );
  if (e.code === "22023")
    return new ErroDados(e.message?.replace(/^gestao:\s*/, "") || padrao, e.code);
  return new ErroDados(padrao, e.code);
}

export const mensagemDeErro = (e: unknown, padrao: string): string =>
  e instanceof ErroDados || e instanceof ErroValidacao ? e.message : padrao;

// ---------------------------------------------------------------------------
// Quem sou eu (lê o que o banco permite: as próprias funções de papel)
// ---------------------------------------------------------------------------

export interface Sessao {
  uid: string | null;
  papeis: Papel[];
  /** Existe um pedido de acesso meu, ainda sem papel definido. */
  pedido: PedidoAcesso | null;
  /**
   * Nome de quem está logado, para assinar os encaminhamentos (o "quem" que o Diego pediu em
   * 2026-09-22). Vem de `gestao_perfis`; `null` quando o perfil não tem nome cadastrado — aí o
   * encaminhamento é gravado sem assinatura, nunca com um nome inventado.
   */
  nome: string | null;
}

/**
 * Descobre os papéis perguntando ao banco (gestao_tem_papel), que já inclui platform_admin e papel 'admin'.
 * Não repete a regra no cliente. Erro de rede → ErroDados (não vira "sem acesso" silencioso).
 */
export async function descobrirSessao(): Promise<Sessao> {
  const { data: u } = await sb().auth.getSession();
  const uid: string | null = u?.session?.user?.id ?? null;
  if (!uid) return { uid: null, papeis: [], pedido: null, nome: null };
  const respostas = await Promise.all(
    PAPEIS.map(async (p) => {
      const { data, error } = await sb().rpc("gestao_tem_papel", { p_papeis: [p.id] });
      if (error) throw traduz(error, "Não consegui conferir o seu acesso.");
      return data === true ? p.id : null;
    }),
  );
  const papeis = respostas.filter((x): x is Papel => x !== null);
  let pedido: PedidoAcesso | null = null;
  if (papeis.length === 0) {
    const { data, error } = await sb()
      .from("gestao_acesso_pedidos")
      .select("id, pedido_em")
      .eq("id", uid)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw traduz(error, "Não consegui ler o seu pedido de acesso.");
    pedido = (data as PedidoAcesso | null) ?? null;
  }
  // Nome de quem está logado, para assinar encaminhamentos. Falhar aqui não pode derrubar a entrada
  // no app: sem nome, os registros ficam sem assinatura e o resto funciona igual.
  let nome: string | null = null;
  try {
    const eu = await perfis([uid]);
    nome = eu[0]?.nome ?? null;
  } catch {
    nome = null;
  }
  return { uid, papeis, pedido, nome };
}

/** Quem não tem acesso registra o próprio pedido, SEM conteúdo (a política exige extras = {}). */
export async function pedirAcesso(uid: string): Promise<void> {
  const { data, error } = await sb()
    .from("gestao_acesso_pedidos")
    .upsert({ id: uid, extras: {}, deleted_at: null }, { onConflict: "id" })
    .select("id");
  if (error) throw traduz(error, "Não consegui enviar o pedido de acesso.");
  if (!data || data.length !== 1) throw new ErroDados("O pedido não foi gravado.");
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type ChaveTabela = Exclude<ChaveDados, "atividade">;

export const TABELAS: Record<
  ChaveTabela,
  { tabela: string; ordem: string; semDeletedAt?: boolean }
> = {
  clientes: { tabela: "gestao_clientes", ordem: "nome" },
  parcelas: { tabela: "gestao_parcelas", ordem: "vencimento" },
  mensalidades: { tabela: "gestao_mensalidades", ordem: "cliente_id" },
  vendedores: { tabela: "gestao_vendedores", ordem: "nome" },
  vendas: { tabela: "gestao_vendas", ordem: "criado_em" },
  indicadores: { tabela: "gestao_indicadores", ordem: "criado_em" },
  indicacoes: { tabela: "gestao_indicacoes", ordem: "criado_em" },
  funcionarios: { tabela: "gestao_funcionarios", ordem: "nome" },
  implementacoes: { tabela: "gestao_implementacoes", ordem: "criado_em" },
  implReunioes: { tabela: "gestao_impl_reunioes", ordem: "data" },
  suporteAtend: { tabela: "gestao_suporte_atend", ordem: "criado_em" },
  chamados: { tabela: "gestao_chamados", ordem: "numero" },
  reunioes: { tabela: "gestao_reunioes", ordem: "data" },
  tarefas: { tabela: "gestao_tarefas", ordem: "criado_em" },
  reunioesEquipe: { tabela: "gestao_reunioes_equipe", ordem: "data" },
  config: { tabela: "gestao_config", ordem: "chave" },
  acessos: { tabela: "gestao_acessos", ordem: "criado_em" },
  pedidos: { tabela: "gestao_acesso_pedidos", ordem: "pedido_em" },
};

const JANELA = 1000;
const MAX_PAGINAS = 30;

/** Lê uma tabela inteira, em janelas de 1000, sem as linhas apagadas. Falha = ErroDados. */
export async function lerTabela<T>(tabela: string, ordem: string, colunas = "*"): Promise<T[]> {
  const todas: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * JANELA;
    // ordem estável (coluna + chave) para as janelas não repetirem nem pularem linha
    let q = sb()
      .from(tabela)
      .select(colunas)
      .is("deleted_at", null)
      .order(ordem, { ascending: true });
    if (tabela !== "gestao_config") q = q.order("id", { ascending: true });
    const { data, error } = await q.range(de, de + JANELA - 1);
    if (error) throw traduz(error, "Não consegui carregar os dados da gestão.");
    const linhas = (data ?? []) as T[];
    todas.push(...linhas);
    if (linhas.length < JANELA) return todas;
  }
  throw new ErroDados("A lista é grande demais para carregar de uma vez.");
}

/**
 * Carrega o que este papel LÊ (a RLS confirma). Devolve só as chaves pedidas; as que o papel não lê ficam de fora,
 * e a interface mantém o valor vazio de DADOS_VAZIOS.
 */
export async function carregarDados(
  papeis: Papel[],
  chaves?: ChaveTabela[],
): Promise<Partial<Dados>> {
  const alvo = (chaves ?? (Object.keys(TABELAS) as ChaveTabela[])).filter((k) =>
    podeLer(papeis, k),
  );
  const resultados = await Promise.all(
    alvo.map(async (k) => {
      // acessos e pedidos: admin lê todas; os outros papéis leem só a própria linha (a RLS restringe), então nem pedimos
      const linhas = await lerTabela<Record<string, unknown>>(TABELAS[k].tabela, TABELAS[k].ordem).catch((e: unknown) => {
        // chamados ainda não criados no banco: a Gestão abre sem eles, em vez de cair inteira (revisão final I1)
        if (k === "chamados" && tabelaDeChamadosAusente(e)) {
          console.warn("[Gestão] tabela gestao_chamados ainda não existe no banco; seguindo sem chamados");
          return [];
        }
        throw e;
      });
      return [k, linhas] as const;
    }),
  );
  const saida: Partial<Dados> = {};
  for (const [k, linhas] of resultados) {
    if (k === "config") {
      saida.config = Object.fromEntries(linhas.map((l) => [String(l.chave), l.valor]));
    } else {
      (saida as Record<string, unknown>)[k] = linhas;
    }
  }
  return saida;
}

/**
 * Atividade dos 12 meses que terminam em `mes`, vinda da função do banco (uso real + digitado por cima; decisão 8).
 * Só financeiro/admin executam; para os outros devolve vazio sem chamar.
 */
export async function carregarAtividade(papeis: Papel[], mes: string): Promise<AtividadeFinal[]> {
  if (!podeLer(papeis, "atividade")) return [];
  const { data, error } = await sb().rpc("gestao_atividade_uso", {
    p_de: somarMes(mes, -11),
    p_ate: mes,
  });
  if (error) throw traduz(error, "Não consegui carregar a atividade da babel.");
  return atividadeDeUso((data ?? []) as AtividadeUso[]);
}

/**
 * Quando o consumo mostrado na Atividade foi calculado pela última vez (`max(atualizado_em)` do cache).
 *
 * B10 (auditoria, 2026-09-22): a partir do v3 a leitura é 100% cache e quem o atualiza é um job de 30 min.
 * Isso troca "lento e barulhento" (o 57014 que o usuário via) por "rápido e possivelmente velho" — e velho
 * em silêncio é pior. Esta função é o que deixa a tela dizer a idade do dado, então o atraso passa a ter
 * teto visível. Nunca derruba a tela: em banco onde a função ainda não existe (v2), ou sem permissão,
 * devolve `null` e a tela apenas não mostra a idade.
 */
export async function carregarAtividadeAtualizadaEm(papeis: Papel[]): Promise<string | null> {
  if (!podeLer(papeis, "atividade")) return null;
  const { data, error } = await sb().rpc("gestao_atividade_uso_atualizado_em");
  if (error) return null;
  return typeof data === "string" ? data : null;
}

// ---------------------------------------------------------------------------
// Gravação (sucesso só com a linha de volta)
// ---------------------------------------------------------------------------

type Linha = Record<string, unknown>;

async function confirma(
  q: PromiseLike<{ data: unknown; error: ErroPostgrest | null }>,
  padrao: string,
): Promise<Linha> {
  const { data, error } = await q;
  if (error) throw traduz(error, padrao);
  const linhas = (data ?? []) as Linha[];
  if (linhas.length !== 1) {
    // RLS negou (0 linhas) ou o registro não existe: NÃO é sucesso
    throw new ErroDados("Não foi possível gravar (sem permissão ou o registro não existe mais).");
  }
  return linhas[0];
}

export const inserir = (
  tabela: string,
  campos: Linha,
  padrao = "Não consegui salvar.",
): Promise<Linha> => confirma(sb().from(tabela).insert(campos).select(), padrao);

export const atualizar = (
  tabela: string,
  id: string,
  campos: Linha,
  padrao = "Não consegui salvar.",
): Promise<Linha> => confirma(sb().from(tabela).update(campos).eq("id", id).select(), padrao);

/** Apagar = marcar `deleted_at`. Não existe DELETE físico. */
export const apagar = (
  tabela: string,
  id: string,
  padrao = "Não consegui apagar.",
): Promise<Linha> =>
  confirma(
    sb().from(tabela).update({ deleted_at: new Date().toISOString() }).eq("id", id).select(),
    padrao,
  );

export const upsertar = (
  tabela: string,
  campos: Linha,
  conflito: string,
  padrao = "Não consegui salvar.",
): Promise<Linha> =>
  confirma(sb().from(tabela).upsert(campos, { onConflict: conflito }).select(), padrao);

/**
 * Marca ou desmarca uma mensalidade (competência n do cliente). `pagoEm` AAAA-MM-DD ou null para desfazer.
 * Sem limite de ciclo (decisão 1). Desfazer mantém a linha; o gatilho guarda a versão paga no histórico.
 */
export const definirMensalidade = (
  clienteId: string,
  n: number,
  pagoEm: string | null,
  valorRecebido: number | null,
): Promise<Linha> =>
  upsertar(
    "gestao_mensalidades",
    { cliente_id: clienteId, n, pago_em: pagoEm, valor_recebido: valorRecebido, deleted_at: null },
    "cliente_id,n",
    "Não consegui gravar a mensalidade.",
  );

/**
 * Grava tokens OU leads digitados. Manda só o campo digitado (o outro não é tocado), para não "congelar" o uso real
 * do outro campo (risco N3 do plano). Valor vazio (null) devolve o mês ao uso real.
 */
export const salvarAtividade = (
  clienteId: string,
  competencia: string,
  campo: "tokens" | "leads",
  valor: number | null,
): Promise<Linha> =>
  upsertar(
    "gestao_atividade",
    { cliente_id: clienteId, competencia, [campo]: valor, deleted_at: null },
    "cliente_id,competencia",
    "Não consegui salvar a atividade.",
  );

/** Documento único (equipe, rodizioSuporte…). */
export const gravarConfig = (chave: string, valor: unknown): Promise<Linha> =>
  confirma(
    sb()
      .from("gestao_config")
      .upsert({ chave, valor, deleted_at: null }, { onConflict: "chave" })
      .select(),
    "Não consegui salvar a configuração.",
  );

/**
 * D-1 (Diego) + decisão do Theus 2026-09-24: Admin, Comercial e Financeiro enviam o cliente para a implementação
 * pela aba Clientes. Função estreita do banco (`plano-integracao/2026-09-24/FLUXO-EMPURRADO.sql`): cria a linha
 * "aguardando" com o carimbo, o responsável = implementador do cliente (artefato :2036) e quem enviou.
 */
export async function enviarImplementacao(clienteId: string): Promise<string> {
  const { data, error } = await sb().rpc("gestao_enviar_implementacao", { p_cliente_id: clienteId });
  if (error) throw traduz(error, "Não consegui enviar o cliente para a implementação.");
  return data as string;
}

/** Estado da implementação de cada cliente (só 5 campos), para a coluna da aba Clientes — artefato `botaoImplCliente`. */
export interface ImplDoCliente {
  cliente_id: string;
  impl_id: string;
  status: string | null;
  enviado_em: string | null;
  concluido_em: string | null;
}

export async function carregarImplDosClientes(): Promise<ImplDoCliente[]> {
  const { data, error } = await sb().rpc("gestao_implementacao_dos_clientes");
  if (error) throw traduz(error, "Não consegui ler o estado da implementação dos clientes.");
  return (data ?? []) as ImplDoCliente[];
}

/**
 * Suporte do cliente (`gestao_clientes.suporte`) gravado por quem atende — artefato :2710 e :2807-2809.
 * Função estreita (`plano-integracao/2026-09-24/PERMISSOES-IGUAL-ARTEFATO.sql`): Suporte e Implementação (e admin)
 * mudam só essa coluna, sem poder ler nem alterar o resto do cliente.
 */
export async function definirSuporteCliente(clienteId: string, nome: string | null): Promise<void> {
  const { error } = await sb().rpc("gestao_definir_suporte_cliente", { p_cliente_id: clienteId, p_nome: nome });
  if (error) throw traduz(error, "Não consegui gravar o suporte do cliente.");
}

/**
 * "Excluir do suporte" (artefato :2689-2697): marca `suporte_removido` na implementação concluída. Função estreita
 * (PERMISSOES-IGUAL-ARTEFATO.sql, rodada 2 do Serjão): o Suporte não ganha edição da implementação inteira.
 */
export async function excluirDoSuporte(implId: string): Promise<void> {
  const { error } = await sb().rpc("gestao_excluir_do_suporte", { p_impl_id: implId });
  if (error) throw traduz(error, "Não consegui excluir do suporte.");
}

/** Decisão 11: a conclusão da implementação grava rodízio e suporte do cliente por esta função estreita. */
export async function atribuirSuporte(implId: string, nome: string, indice: number): Promise<void> {
  const { error } = await sb().rpc("gestao_atribuir_suporte", {
    p_impl_id: implId,
    p_nome: nome,
    p_indice: indice,
  });
  if (error) throw traduz(error, "Não consegui atribuir o suporte.");
}

// ---------------------------------------------------------------------------
// Acessos e perfis (só id, nome e avatar; sem e-mail nem telefone)
// ---------------------------------------------------------------------------

export async function perfis(ids: string[]): Promise<PerfilBasico[]> {
  if (ids.length === 0) return [];
  const { data, error } = await sb().rpc("gestao_perfis", { p_ids: ids });
  if (error) throw traduz(error, "Não consegui carregar os perfis.");
  return (data ?? []) as PerfilBasico[];
}

export async function buscarPerfis(q: string): Promise<PerfilBasico[]> {
  const { data, error } = await sb().rpc("gestao_buscar_perfis", { p_q: q });
  if (error) throw traduz(error, "Não consegui buscar pessoas.");
  return (data ?? []) as PerfilBasico[];
}

export const salvarAcesso = (
  id: string,
  papeis: Papel[],
  pessoa: string,
  porId: string | null,
): Promise<Linha> =>
  upsertar(
    "gestao_acessos",
    { id, papeis, pessoa: pessoa || null, por_id: porId, deleted_at: null },
    "id",
    "Não consegui salvar o acesso.",
  );

export const removerAcesso = (id: string): Promise<Linha> =>
  apagar("gestao_acessos", id, "Não consegui remover o acesso.");

// ---------------------------------------------------------------------------
// LGPD (decisão 9): só admin; nunca agendado. `executar=false` só conta.
// ---------------------------------------------------------------------------

export async function eliminarExpirados(
  executar: boolean,
): Promise<Array<{ tabela: string; linhas: number }>> {
  const { data, error } = await sb().rpc("gestao_eliminar_expirados", { p_executar: executar });
  if (error) throw traduz(error, "Não consegui verificar os dados expirados.");
  return ((data ?? []) as Array<{ tabela: string; linhas: number | string }>).map((l) => ({
    tabela: l.tabela,
    linhas: Number(l.linhas),
  }));
}

// ---------------------------------------------------------------------------
// Backup: exportar e importar na ordem das chaves (decisão 14)
// ---------------------------------------------------------------------------

export interface Backup {
  versao: number;
  geradoEm: string;
  colecoes: Record<string, Array<Record<string, unknown>>>;
}

/** Só admin (a RLS de cada tabela também confere). Lê tudo do banco e devolve no formato do Backup do original. */
export async function exportarBackup(): Promise<Backup> {
  const linhasPorColecao: Record<string, Linha[]> = {};
  const origem = new Map<string, string>();
  for (const [colecao, cat] of Object.entries(MAPA)) {
    const linhas = await lerTabela<Linha>(cat.tabela, "criado_em");
    linhasPorColecao[colecao] = linhas;
    for (const l of linhas) if (l.id_origem) origem.set(String(l.id), String(l.id_origem));
  }
  const origemDe = (u: string): string => origem.get(u) ?? u;
  const colecoes: Backup["colecoes"] = {};
  for (const [colecao, linhas] of Object.entries(linhasPorColecao)) {
    colecoes[colecao] = linhas.map((l) => ({
      id: String(l.id_origem ?? l.id),
      ...linhaParaDoc(colecao, l, origemDe),
    }));
  }
  const cfg = await lerTabela<Linha>("gestao_config", "chave");
  if (cfg.length) {
    colecoes[COLECAO_CONFIG] = cfg.map((l) => ({
      id: String(l.chave),
      ...((l.valor as Record<string, unknown>) ?? {}),
    }));
  }
  return { versao: 1, geradoEm: new Date().toISOString(), colecoes };
}

export interface ResultadoImportacao {
  total: number;
  importados: number;
  erros: string[];
}

const LOTE = 100;

/**
 * Importa um Backup em 3 etapas, cada uma terminada antes da próxima: (1) clientes; (2) parcelas, mensalidades e atividade
 * (têm FK de cliente); (3) o resto. Idempotente: o id vem do texto do documento (mesmo id do sandbox), então reimportar
 * atualiza em vez de duplicar. Só admin. O chamador deve avisar erro se `erros.length > 0`.
 */
export async function importarBackup(
  backup: unknown,
  aoProgresso?: (feitos: number, total: number) => void,
): Promise<ResultadoImportacao> {
  const cols = (backup as Backup | null)?.colecoes;
  if (!cols || typeof cols !== "object")
    throw new ErroDados("O texto colado não é um backup válido.");
  const resultado: ResultadoImportacao = { total: 0, importados: 0, erros: [] };

  type Item = { tabela: string; conflito: string; linha: Linha; rotulo: string };
  const etapas: Item[][] = [[], [], []];
  for (const [colecao, docs] of Object.entries(cols)) {
    if (!Array.isArray(docs)) continue;
    for (const d of docs) {
      if (!d || typeof d !== "object" || !("id" in d) || !d.id) continue;
      const id = String(d.id);
      resultado.total++;
      try {
        if (colecao === COLECAO_CONFIG) {
          const { id: _ignora, ...valor } = d as Record<string, unknown>;
          etapas[2].push({
            tabela: "gestao_config",
            conflito: "chave",
            linha: { chave: id, valor, deleted_at: null },
            rotulo: `config/${id}`,
          });
        } else if (MAPA[colecao]) {
          const cat = MAPA[colecao];
          const linha = docParaLinha(colecao, id, d);
          linha.deleted_at = null;
          etapas[cat.etapa - 1].push({
            tabela: cat.tabela,
            conflito: "id",
            linha,
            rotulo: `${colecao}/${id}`,
          });
        }
      } catch (e) {
        resultado.erros.push(`${colecao}/${id}: ${e instanceof Error ? e.message : "inválido"}`);
      }
    }
  }
  let feitos = resultado.erros.length;
  aoProgresso?.(feitos, resultado.total);
  for (const etapa of etapas) {
    // agrupa por tabela para enviar em lote; a etapa só termina quando todas as tabelas dela terminaram
    const porTabela = new Map<string, Item[]>();
    for (const it of etapa) porTabela.set(it.tabela, [...(porTabela.get(it.tabela) ?? []), it]);
    for (const itens of porTabela.values()) {
      for (let i = 0; i < itens.length; i += LOTE) {
        const lote = itens.slice(i, i + LOTE);
        const { error } = await sb()
          .from(lote[0].tabela)
          .upsert(
            lote.map((x) => x.linha),
            { onConflict: lote[0].conflito },
          );
        if (!error) {
          resultado.importados += lote.length;
        } else {
          // o lote falhou: tenta linha a linha para saber exatamente quais falharam
          for (const it of lote) {
            const r = await sb().from(it.tabela).upsert(it.linha, { onConflict: it.conflito });
            if (r.error) resultado.erros.push(`${it.rotulo}: ${traduz(r.error, "falhou").message}`);
            else resultado.importados++;
          }
        }
        feitos += lote.length;
        aoProgresso?.(Math.min(feitos, resultado.total), resultado.total);
      }
    }
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Importação de indicações (A1, auditoria do Serjão 2026-09-24)
// ---------------------------------------------------------------------------

/**
 * Procura UMA indicação pelo `id_origem`, inclusive a excluída (soft delete). Serve só à importação: a leitura
 * normal (`lerTabela`) não traz excluídas, e inserir de novo a mesma origem dá 23505 (id_origem é único).
 * Não abre leitura geral de excluídas: devolve só `id` e `deleted_at` da linha pedida. A política
 * `indicacoes_le` não filtra `deleted_at`, então o Comercial enxerga a linha; se um dia filtrar, volta `null`
 * e a importação cai no 23505 daquela linha (a tela avisa e segue para as outras).
 */
export async function indicacaoPorOrigem(
  idOrigem: string,
): Promise<{ id: string; deleted_at: string | null } | null> {
  const { data, error } = await sb()
    .from("gestao_indicacoes")
    .select("id, deleted_at")
    .eq("id_origem", idOrigem)
    .limit(1);
  if (error) throw traduz(error, "Não consegui conferir a indicação importada.");
  const linha = ((data ?? []) as Array<{ id: string; deleted_at: string | null }>)[0];
  return linha ?? null;
}

/**
 * Lote operação (2026-09-24, A3 da auditoria): o atendimento de suporte com esta origem (`sa-<id da implementação>`),
 * MESMO se estiver marcado como apagado — só `id` e `deleted_at`. É o que deixa "garantir o atendimento" (artefato
 * `garantirAtend` :2002) reaproveitar a linha apagada em vez de bater no 23505 (id_origem é único). A política
 * `suporte_atend_le` não filtra `deleted_at`; se um dia filtrar, volta `null` e a tela mostra o erro do banco.
 */
export async function suporteAtendPorOrigem(
  idOrigem: string,
): Promise<{ id: string; deleted_at: string | null } | null> {
  const { data, error } = await sb()
    .from("gestao_suporte_atend")
    .select("id, deleted_at")
    .eq("id_origem", idOrigem)
    .limit(1);
  if (error) throw traduz(error, "Não consegui conferir o atendimento de suporte.");
  const linha = ((data ?? []) as Array<{ id: string; deleted_at: string | null }>)[0];
  return linha ?? null;
}

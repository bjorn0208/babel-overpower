/**
 * Produto em foco da conversa (Chat Treino, 2026-09-18).
 *
 * `conversas.produto_foco_id` diz de qual produto/serviço a conversa está tratando. O Chat Treino
 * escolhe antes de começar; o motor troca sozinho quando o lead passa a falar de OUTRO produto —
 * é o que decide qual conversa padrão entra no prompt (uma por vez, pra não misturar conhecimento).
 *
 * `detectarProdutoMencionado` é puro: só casa o texto do lead com os nomes do catálogo.
 * `carregarConversaPadrao` lê a conversa padrão ativa do agente pro produto (ou a geral).
 */

export interface ProdutoCatalogo {
  id: string;
  nome: string;
}

const PALAVRAS_FRACAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "para", "pra", "com", "em", "no", "na",
  "pessoa", "fisica", "juridica", "servico", "servicos", "plano", "planos", "pacote",
  "financeira", "financeiro", "consulta", "processo", "individual", "coletivo",
]);

export function normalizar(txt: string): string {
  return txt
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Chaves de busca de um produto: nome inteiro, nome sem o complemento após "—"/"-", 2 primeiras palavras fortes e a 1ª palavra forte. */
export function chavesProduto(nome: string): string[] {
  const inteiro = normalizar(nome);
  const base = normalizar(nome.split(/\s[—–-]\s/)[0] ?? nome);
  const fortes = base.split(" ").filter((p) => p.length >= 4 && !PALAVRAS_FRACAS.has(p));
  const chaves = new Set<string>([inteiro, base]);
  if (fortes.length >= 2) chaves.add(`${fortes[0]} ${fortes[1]}`);
  if (fortes.length >= 1 && fortes[0].length >= 5) chaves.add(fortes[0]);
  return [...chaves].filter((c) => c.length >= 4);
}

function contemPalavra(texto: string, chave: string): boolean {
  return ` ${texto} `.includes(` ${chave} `);
}

/**
 * Qual produto o lead mencionou nesta mensagem. Devolve:
 *  - o produto atual, se ele está entre os mencionados (não troca à toa);
 *  - o único produto mencionado;
 *  - entre vários, o de chave casada mais longa, se for único; senão null (ambíguo → não troca).
 */
export function detectarProdutoMencionado(
  mensagem: string,
  catalogo: ProdutoCatalogo[],
  atualId: string | null,
): string | null {
  const texto = normalizar(mensagem);
  if (!texto) return null;
  const casados: Array<{ id: string; tam: number }> = [];
  for (const p of catalogo) {
    const tam = Math.max(0, ...chavesProduto(p.nome).filter((c) => contemPalavra(texto, c)).map((c) => c.length));
    if (tam > 0) casados.push({ id: p.id, tam });
  }
  if (casados.length === 0) return null;
  if (atualId && casados.some((c) => c.id === atualId)) return atualId;
  if (casados.length === 1) return casados[0].id;
  const maior = Math.max(...casados.map((c) => c.tam));
  const topo = casados.filter((c) => c.tam === maior);
  return topo.length === 1 ? topo[0].id : null;
}

export interface ConversaPadraoAtiva {
  id: string;
  bloco_id: string | null;
  produto_id: string | null;
  produto_nome: string | null;
  diretrizes: string[];
  transcricao: Array<{ papel: string; texto: string }>;
}

// deno-lint-ignore no-explicit-any
export async function carregarConversaPadrao(sb: any, agenteId: string, produtoId: string | null): Promise<ConversaPadraoAtiva | null> {
  const cols = "id, bloco_id, produto_id, produto_nome, diretrizes, transcricao";
  if (produtoId) {
    const { data } = await sb.from("conversas_padrao").select(cols)
      .eq("agente_id", agenteId).eq("produto_id", produtoId).eq("ativo", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) return data as ConversaPadraoAtiva;
  }
  const { data: geral } = await sb.from("conversas_padrao").select(cols)
    .eq("agente_id", agenteId).is("produto_id", null).eq("ativo", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (geral as ConversaPadraoAtiva | null) ?? null;
}

/** Seção do prompt. `rotulo` numera no mesmo registro [N] das outras fontes (o auditor aceita o que vier daqui). */
export function montarBlocoConversaPadrao(
  cp: ConversaPadraoAtiva | null,
  rotulo: (id: string | null | undefined, fonte: string) => string,
  limiteChars = 4500,
): string {
  if (!cp) return "";
  const falas = (Array.isArray(cp.transcricao) ? cp.transcricao : [])
    .map((m) => `${m.papel === "lead" ? "Lead" : "Você"}: ${String(m.texto ?? "").trim()}`)
    .join("\n");
  const regras = (Array.isArray(cp.diretrizes) ? cp.diretrizes : []).map((d) => `- ${d}`).join("\n");
  const corpo = `${regras ? `REGRAS DO DONO:\n${regras}\n\n` : ""}CONVERSA DE REFERÊNCIA:\n${falas}`.slice(0, limiteChars);
  return `\n\n<conversa_padrao produto="${cp.produto_nome ?? "geral"}" importancia="alta">\n` +
    `${rotulo(cp.bloco_id, "conversa_padrao")} Esta é a CONVERSA PADRÃO que o dono treinou${cp.produto_nome ? ` para ${cp.produto_nome}` : ""}. ` +
    `Ela é a sua base FIXA de resposta nesse assunto: siga a mesma ordem de passos, o mesmo tom, o mesmo tamanho de bolha e o mesmo jeito de perguntar. ` +
    `Adapte ao lead de agora (o que ele perguntou, o nome, a situação dele) — nunca copie dados pessoais do exemplo. ` +
    `Valores, prazos e regras continuam vindo da base de conhecimento; se a conversa de referência divergir de um valor da base, vale a base.\n` +
    `${corpo}\n</conversa_padrao>`;
}

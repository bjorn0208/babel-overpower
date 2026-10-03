/**
 * Pacotes de Conhecimento — regras puras (sem banco), compartilhadas entre o Hub do
 * tenant e a aba de Curadoria do admin. Espelham os CHECKs e a catraca do banco
 * (`pacotes_conhecimento_blocos_tamanho_check`, `pacote_liberado_para_tenant`).
 */

export type OrigemPacote = "admin" | "tenant";
export type ModoBloco = "sempre" | "relevancia";

export type Pacote = {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  cor: string | null;
  origem: OrigemPacote;
  tenant_id: string | null;
  nicho_id: string | null;
  loja_aplicativo_id: string | null;
  ativo: boolean;
  ordem: number;
  updated_at: string;
};

export type BlocoPacote = {
  id: string;
  pacote_id: string;
  titulo: string;
  conteudo: string;
  modo: ModoBloco;
  category: string | null;
  tags: string[];
  ordem: number;
  ativo: boolean;
  embedding_status: "pendente" | "pronto" | "erro";
  updated_at: string;
};

/** Limites do banco (CHECK pacotes_blocos_tamanho_check). */
export const LIMITE_CONTEUDO: Record<ModoBloco, number> = { sempre: 1500, relevancia: 8000 };
export const LIMITE_TITULO = 200;
export const LIMITE_NOME_PACOTE = 120;

export const ROTULO_MODO: Record<ModoBloco, { titulo: string; descricao: string }> = {
  sempre: {
    titulo: "Sempre",
    descricao: "Vai inteiro em toda conversa. Use para regras curtas (até 1.500 caracteres).",
  },
  relevancia: {
    titulo: "Por relevância",
    descricao: "Entra só quando o assunto da conversa bate. Use para conteúdo maior (até 8.000).",
  },
};

export type ValoresBlocoPacote = {
  titulo: string;
  conteudo: string;
  modo: ModoBloco;
  category: string;
  tags: string;
};

/** Mensagem de erro do formulário do bloco, ou null se pode salvar. */
export function validarBloco(v: ValoresBlocoPacote): string | null {
  const titulo = v.titulo.trim();
  const conteudo = v.conteudo.trim();
  if (!titulo) return "Dê um título ao bloco.";
  if (titulo.length > LIMITE_TITULO) return `Título com no máximo ${LIMITE_TITULO} caracteres.`;
  if (!conteudo) return "Escreva o conteúdo do bloco.";
  const limite = LIMITE_CONTEUDO[v.modo];
  if (conteudo.length > limite) {
    return v.modo === "sempre"
      ? `No modo "Sempre" o limite é ${limite.toLocaleString("pt-BR")} caracteres — encurte ou troque para "Por relevância".`
      : `Conteúdo com no máximo ${limite.toLocaleString("pt-BR")} caracteres — divida em mais de um bloco.`;
  }
  return null;
}

/** "a, b ,, c" → ["a","b","c"] (sem repetidos, minúsculas). */
export function parseTags(texto: string): string[] {
  const vistos = new Set<string>();
  for (const t of texto.split(",")) {
    const limpo = t.trim().toLowerCase();
    if (limpo) vistos.add(limpo);
  }
  return [...vistos];
}

/** Payload de insert/update do bloco a partir do formulário. */
export function montarLinhaBloco(v: ValoresBlocoPacote) {
  return {
    titulo: v.titulo.trim(),
    conteudo: v.conteudo.trim(),
    modo: v.modo,
    category: v.category.trim() || null,
    tags: parseTags(v.tags),
  };
}

/**
 * Situação de um pacote para um agente, na visão do tenant.
 * - "ligado" / "desligado": pode alternar.
 * - "instalar": pacote da Babel vendido na Loja e ainda não instalado.
 */
export type SituacaoPacote = "ligado" | "desligado" | "instalar";

export function situacaoPacote(
  pacote: Pick<Pacote, "origem" | "loja_aplicativo_id">,
  opts: { ligado: boolean; instalado: boolean },
): SituacaoPacote {
  if (pacote.origem === "admin" && pacote.loja_aplicativo_id && !opts.instalado) return "instalar";
  return opts.ligado ? "ligado" : "desligado";
}

/** Resumo "3 blocos · 1 sempre · 2 por relevância" para o card. */
export function resumoBlocos(blocos: Pick<BlocoPacote, "modo" | "ativo">[]): string {
  const ativos = blocos.filter((b) => b.ativo);
  if (!blocos.length) return "Sem blocos ainda";
  const sempre = ativos.filter((b) => b.modo === "sempre").length;
  const rel = ativos.length - sempre;
  const partes = [
    `${ativos.length} bloco${ativos.length === 1 ? "" : "s"} ativo${ativos.length === 1 ? "" : "s"}`,
  ];
  if (sempre) partes.push(`${sempre} sempre`);
  if (rel) partes.push(`${rel} por relevância`);
  return partes.join(" · ");
}

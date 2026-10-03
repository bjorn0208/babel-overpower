/**
 * Tipos complementares para desenvolvimento local.
 * O pacote publicado omitiu este módulo, importado somente com `import type`.
 * Declarações preservadas do código local anterior; nenhuma implementação runtime foi adicionada.
 */
export type BlocoParaSintese = {
  id: string;
  title?: string | null;
  content: string;
  category?: string | null;
  rerank_score?: number;
};

export type BolhaComCitacao = {
  texto: string;
  blocos_usados: string[];
  tipo: "fato_produto" | "promessa" | "humanizacao" | "variacao" | "pergunta_socratica" | "acolhimento";
};

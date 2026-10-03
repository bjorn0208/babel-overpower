/**
 * Normaliza a categoria devolvida pela Gemma na destilação pras 5 categorias
 * aceitas pelo CHECK `lead_memory_categoria_check` de `public.memoria_lead`.
 *
 * Sem isso, 100% dos inserts de fato longo falhavam (categoria inválida:
 * a Gemma devolvia demografico/profissional/outro... que não estão no CHECK)
 * e a destilação nunca promovia curto→longo (0 fatos `fonte=destilacao_cron`
 * em todo o banco). Onda 2026-05-16.
 */
const VALIDAS = new Set([
  "fato_biografico",
  "fato_financeiro",
  "objecao",
  "interesse",
  "historico_negociacao",
]);

const APELIDOS: Record<string, string> = {
  demografico: "fato_biografico",
  profissional: "fato_biografico",
  familia: "fato_biografico",
  biografico: "fato_biografico",
  financeiro: "fato_financeiro",
  renda: "fato_financeiro",
  divida: "fato_financeiro",
  dor: "objecao",
  objecao_preco: "objecao",
  preferencia: "interesse",
  objetivo: "interesse",
  desejo: "interesse",
  negociacao: "historico_negociacao",
  historico: "historico_negociacao",
};

export function normalizarCategoriaMemoria(raw: unknown): string {
  const c = String(raw ?? "").toLowerCase().trim();
  if (VALIDAS.has(c)) return c;
  if (c in APELIDOS) return APELIDOS[c];
  return "interesse"; // fallback seguro (mesmo default do A1 do motor)
}

/**
 * Helper único de moeda BR — unifica as 3 convenções incompatíveis de parse
 * que estavam espalhadas nos apps Financeiro e Rifas.
 *
 * Regra de interpretação (convenção pt-BR):
 *  - O PONTO é sempre separador de milhar → removido.
 *  - A VÍRGULA é sempre separador decimal → vira ponto.
 *  - Símbolos e espaços ("R$", " ") são ignorados.
 *
 * Exemplos:
 *  parseMoedaBR("1.234,56") → 1234.56
 *  parseMoedaBR("1500")     → 1500
 *  parseMoedaBR("1.500")    → 1500     (ponto = milhar)
 *  parseMoedaBR("5,50")     → 5.5
 *  parseMoedaBR(1500)       → 1500     (número puro passa direto)
 *
 * String vazia/inválida devolve NaN — cabe ao chamador validar
 * (ex.: `if (!Number.isFinite(valor) || valor <= 0) { ... }`).
 */
export function parseMoedaBR(input: string | number): number {
  if (typeof input === "number") return input;
  if (input == null) return NaN;
  // Mantém só dígitos, ponto, vírgula e sinal (descarta "R$", espaços, etc.).
  const limpo = String(input).trim().replace(/[^\d.,-]/g, "");
  if (limpo === "" || limpo === "-") return NaN;
  // Ponto = milhar (remove), vírgula = decimal (vira ponto).
  const normalizado = limpo.replace(/\./g, "").replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : NaN;
}

/** Formata número como valor BR com 2 casas (ex.: 1234.5 → "1.234,50"). Sem símbolo. */
export function formatMoedaBR(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

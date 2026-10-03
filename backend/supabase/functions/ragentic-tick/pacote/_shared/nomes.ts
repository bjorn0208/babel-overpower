// Heurística grátis "nome parece empresa?" (Theus 2026-09-02) — sem chamada de
// IA, roda na hora. Vai errar casos raros (é o trade-off aceito); cobre bem os
// padrões comuns de contato salvo como empresa/serviço em vez de pessoa.

const PALAVRAS_EMPRESA = [
  "ltda", "me", "epp", "ei", "eireli", "sa", "s\\.a\\.",
  "distribuidora", "comercio", "com[ée]rcio", "loja", "represent(a|ante)?",
  "ativa[cç][aã]o", "banco", "iptv", "consultoria", "assessoria",
  "solu[cç][oõ]es", "corretora", "studio", "financeira", "contabilidade",
  "sal[aã]o", "materiais", "confec[cç][oõ]es", "barbearia", "auto pe[cç]as",
];

const REGEX_PALAVRA_EMPRESA = new RegExp(`\\b(${PALAVRAS_EMPRESA.join("|")})\\b`, "iu");

/** Nome parece empresa/serviço (não pessoa física)? Sem nome também conta como "sim". */
export function pareceNomeEmpresa(nomeBruto: string | null | undefined): boolean {
  const nome = (nomeBruto ?? "").trim();
  if (!nome) return true;
  if (REGEX_PALAVRA_EMPRESA.test(nome)) return true;
  if (/\d/.test(nome)) return true;
  if (nome.includes("|")) return true;
  const palavras = nome.split(/\s+/);
  // 1 palavra só, toda maiúscula, mais de 3 letras — ex: "KUZKUZ", "AVISA API".
  if (palavras.length === 1 && palavras[0].length > 3 && palavras[0] === palavras[0].toUpperCase() && /[A-ZÀ-Ý]/.test(palavras[0])) {
    return true;
  }
  return false;
}

export function primeiroNome(nomeBruto: string | null | undefined): string {
  const nome = (nomeBruto ?? "").trim();
  if (!nome) return "";
  return nome.split(/\s+/)[0];
}

const SAUDACOES_GENERICAS = ["Olá", "Oi", "Opa"];

/** "Oi {primeiroNome}" quando parece pessoa; saudação genérica rotativa senão. */
export function montarSaudacao(nomeBruto: string | null | undefined): string {
  if (!pareceNomeEmpresa(nomeBruto)) {
    const primeiro = primeiroNome(nomeBruto);
    if (primeiro) return `Oi ${primeiro}`;
  }
  return SAUDACOES_GENERICAS[Math.floor(Math.random() * SAUDACOES_GENERICAS.length)];
}

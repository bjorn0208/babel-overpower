/**
 * Guard de chave PIX — impede que a agente mande uma chave PIX que não é do tenant.
 *
 * Por que existe: em 2026-09-11 a Naty (tenant Easy) fechou uma Auditoria e mandou
 * "[Chave PIX: 12.345.678/0001-99 - Easy Soluções Financeiras]" — um CNPJ de exemplo
 * inventado pelo modelo, no formato de placeholder. A chave real (47.650.661/0001-26)
 * está no bloco de pagamento, mas o modelo escreveu de cabeça. Dinheiro do lead indo
 * pra conta errada é o pior defeito possível numa conversa de venda.
 *
 * Como funciona: toda bolha que fala de PIX e traz algo com cara de chave (CNPJ, CPF,
 * telefone, e-mail ou chave aleatória) é conferida contra as chaves cadastradas do
 * tenant. Chave desconhecida → troca pela chave cadastrada (se houver UMA) ou derruba
 * a bolha (se não houver nenhuma ou houver várias — não dá pra adivinhar qual).
 *
 * Módulo puro (zero import): testável sem Supabase nem Deno.
 */

/** Candidatos a chave PIX num texto: CNPJ, CPF, chave aleatória (uuid), e-mail, telefone. */
const RE_CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const RE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const RE_EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const RE_TELEFONE = /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g;

/** A bolha está falando de PIX ou de "chave" (só aí vale conferir chave). */
export const RE_FALA_PIX = /\bpix\b|\bchave\b/i;

/** Normaliza pra comparar: e-mail em minúsculas; resto só dígitos (ou o uuid em minúsculas). */
export function normalizarChave(chave: string): string {
  const s = chave.trim();
  if (s.includes("@")) return s.toLowerCase();
  if (/^[0-9a-f-]{36}$/i.test(s)) return s.toLowerCase();
  return s.replace(/\D/g, "");
}

/** Todas as chaves candidatas encontradas no texto (como escritas). */
export function extrairChavesCandidatas(texto: string): string[] {
  const achadas: string[] = [];
  for (const re of [RE_CNPJ, RE_CPF, RE_UUID, RE_EMAIL]) {
    for (const m of texto.matchAll(re)) achadas.push(m[0]);
  }
  // Telefone só conta se a bolha o apresenta como chave (evita pegar o WhatsApp da empresa
  // numa bolha que também fala de PIX).
  if (/chave[^\n]{0,30}(telefone|celular)|(telefone|celular)[^\n]{0,30}chave/i.test(texto)) {
    for (const m of texto.matchAll(RE_TELEFONE)) achadas.push(m[0]);
  }
  return achadas;
}

/**
 * A bolha é SÓ uma chave numérica (CNPJ/CPF/uuid) — o formato "chave sozinha numa mensagem"
 * que os tenants usam pra o lead copiar de uma vez (Easy e SmartCred instruem isso no bloco
 * de pagamento). Sem a palavra "pix"/"chave" nela, `RE_FALA_PIX` não pegava essa bolha e a
 * chave inventada passava direto — justamente no formato que mandamos o agente usar.
 * E-mail e telefone ficam de fora de propósito: sozinhos numa bolha têm uso legítimo.
 */
export function ehBolhaSoChave(bolha: string): boolean {
  const s = bolha.trim();
  if (!s || s.length > 80) return false;
  const achadas: string[] = [];
  for (const re of [RE_CNPJ, RE_CPF, RE_UUID]) {
    for (const m of s.matchAll(re)) achadas.push(m[0]);
  }
  if (achadas.length !== 1) return false;
  // Tirando a chave, não pode sobrar texto — só pontuação/espaço de enfeite.
  return s.split(achadas[0]).join("").replace(/[\s.:·•\-—]/g, "") === "";
}

export type ResultadoGuardPix =
  | { acao: "ok" }
  | { acao: "trocada"; bolha: string; de: string[]; para: string }
  | { acao: "derrubada"; motivo: "sem_chave_cadastrada" | "varias_chaves_cadastradas"; de: string[] };

/**
 * Confere uma bolha contra as chaves cadastradas do tenant.
 *
 * @param bolha texto da bolha
 * @param chavesTenant chaves PIX cadastradas (profiles, templates de contrato, consultas, rifas), como estão no banco
 * @param chaveExibicao como a chave deve aparecer pro lead quando houver troca (default: 1ª cadastrada)
 */
export function conferirChavePix(
  bolha: string,
  chavesTenant: string[],
  chaveExibicao?: string,
  // `contextoPix`: a bolha ANTERIOR falava de PIX. Liga a checagem da bolha que é só a chave
  // (sem a palavra "pix" dentro dela). O chamador é quem sabe a vizinhança.
  opts?: { contextoPix?: boolean },
): ResultadoGuardPix {
  const _relevante = RE_FALA_PIX.test(bolha) || (opts?.contextoPix === true && ehBolhaSoChave(bolha));
  if (!_relevante) return { acao: "ok" };
  const candidatas = extrairChavesCandidatas(bolha);
  if (candidatas.length === 0) return { acao: "ok" };

  const cadastradas = Array.from(new Set(chavesTenant.map(normalizarChave).filter((c) => c.length >= 6)));
  const invalidas = candidatas.filter((c) => !cadastradas.includes(normalizarChave(c)));
  if (invalidas.length === 0) return { acao: "ok" };

  if (cadastradas.length === 0) return { acao: "derrubada", motivo: "sem_chave_cadastrada", de: invalidas };
  if (cadastradas.length > 1) return { acao: "derrubada", motivo: "varias_chaves_cadastradas", de: invalidas };

  const para = (chaveExibicao ?? chavesTenant.find((c) => normalizarChave(c) === cadastradas[0]) ?? cadastradas[0]).trim();
  let nova = bolha;
  for (const inv of invalidas) nova = nova.split(inv).join(para);
  // "[Chave PIX: ... ]" com colchetes é cara de placeholder — tira os colchetes da linha trocada.
  nova = nova.replace(/\[\s*(chave\s*pix[^\]]*)\]/gi, "$1");
  return { acao: "trocada", bolha: nova, de: invalidas, para };
}

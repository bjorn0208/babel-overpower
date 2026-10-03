/**
 * Variantes equivalentes de um telefone brasileiro: com e sem o 9º dígito.
 *
 * Por quê (caso Otmar, 2026-09-11/12): o app grava o número com o 9
 * (`5545976036108`), mas o WhatsApp devolve o eco/resposta com o JID antigo,
 * sem o 9 (`554576036108`). Buscar a conversa só por `phone = X` não achava a
 * conversa original e o webhook criava uma segunda — a resposta do lead caía
 * numa conversa sem histórico. Toda busca de conversa por telefone deve usar
 * `.in("phone", variantesTelefone(x))`.
 *
 * Regra: só mexe em número BR (55 + DDD + 8/9 dígitos). Celular antigo de
 * 8 dígitos começa em 6-9; celular novo começa em 9 seguido de 6-9. Fixo
 * (2-5) fica intacto. Devolve sempre o valor original primeiro.
 */
export function variantesTelefone(phone: string | null | undefined): string[] {
  const bruto = String(phone ?? "").trim();
  const digitos = bruto.replace(/\D/g, "");
  const saida: string[] = [];
  const add = (v: string) => { if (v && !saida.includes(v)) saida.push(v); };
  add(bruto);
  add(digitos);
  if (/^55\d{10}$/.test(digitos)) {
    const ddd = digitos.slice(2, 4);
    const local = digitos.slice(4);
    if (/^[6-9]/.test(local)) add(`55${ddd}9${local}`);
  } else if (/^55\d{11}$/.test(digitos)) {
    const ddd = digitos.slice(2, 4);
    const local = digitos.slice(4);
    if (local.startsWith("9") && /^[6-9]/.test(local.slice(1))) add(`55${ddd}${local.slice(1)}`);
  }
  return saida;
}

/**
 * O número tem cara de celular (ou seja: dá pra mandar WhatsApp)?
 *
 * Por quê (2026-09-12): planilha de EMPRESAS vem cheia de telefone fixo — na
 * base do Otmar eram 379 de 2.573 (14,7%). Fixo não tem WhatsApp; o disparo
 * volta erro da Z-API e uma sequência de erros seguidos é exatamente o que
 * queima a reputação do número. Antes nada filtrava: entravam todos na fila.
 *
 * Regra BR: fixo começa em 2-5 (8 dígitos locais). Celular é 9 + 8 dígitos
 * (formato atual) ou 8 dígitos começando em 6-9 (formato antigo, ainda vivo em
 * alguns cadastros). Número que não é BR (sem 55 + DDD) passa — não é nosso
 * papel adivinhar plano de numeração de fora.
 */
export function ehCelularBr(phone: string | null | undefined): boolean {
  const digitos = String(phone ?? "").replace(/\D/g, "");
  if (/^55\d{2}9[6-9]\d{7}$/.test(digitos)) return true;  // 55 + DDD + 9XXXXXXXX
  if (/^55\d{2}[6-9]\d{7}$/.test(digitos)) return true;   // 55 + DDD + XXXXXXXX antigo
  if (/^55\d{2}[2-5]\d{7}$/.test(digitos)) return false;  // fixo
  return true; // formato fora do padrão BR: não bloqueia
}

/**
 * Espelha `public.normalizar_telefone_brasil()` (Postgres) — mesma regra,
 * mesmos casos. Existe pra dar defesa em profundidade no client (ex: link
 * `wa.me`) quando o dado já veio errado do banco; a fonte da verdade
 * continua sendo a normalização no servidor.
 */
export function normalizarTelefoneBrasil(bruto: string | null | undefined): string | null {
  let v = String(bruto ?? "").replace(/\D/g, "");
  v = v.replace(/^0+/, "");
  if (/^55\d{10,11}$/.test(v)) return v;
  if (/^\d{10,11}$/.test(v)) return "55" + v;
  return null;
}

/**
 * Variantes equivalentes do mesmo número BR — com e sem o 9º dígito.
 * Espelha `supabase/functions/_shared/telefone.ts` (variantesTelefone) e
 * `public.telefones_equivalentes()`. Devolve o original primeiro.
 *
 * Serve pra qualquer busca por telefone: o mesmo lead pode estar gravado
 * `5545976036108` (app) ou `554576036108` (eco do WhatsApp) — igualdade exata
 * trata os dois como pessoas diferentes.
 */
export function variantesTelefoneBr(bruto: string | null | undefined): string[] {
  const original = String(bruto ?? "").trim();
  const digitos = original.replace(/\D/g, "");
  const saida: string[] = [];
  const add = (v: string) => { if (v && !saida.includes(v)) saida.push(v); };
  add(original);
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
 * Forma canônica pra comparar dois telefones BR: sempre SEM o 9º dígito.
 * `5545976036108` e `554576036108` viram a mesma chave.
 */
export function chaveTelefone(bruto: string | null | undefined): string {
  const d = String(bruto ?? "").replace(/\D/g, "");
  const m = d.match(/^55(\d{2})9([6-9]\d{7})$/);
  return m ? `55${m[1]}${m[2]}` : d;
}

/**
 * Tem cara de celular (dá pra mandar WhatsApp)? Espelha `ehCelularBr` do
 * `_shared/telefone.ts`. Fixo BR começa em 2-5 e não recebe WhatsApp.
 */
export function ehCelularBr(bruto: string | null | undefined): boolean {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (/^55\d{2}9[6-9]\d{7}$/.test(d)) return true;
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) return true;
  if (/^55\d{2}[2-5]\d{7}$/.test(d)) return false;
  return true;
}

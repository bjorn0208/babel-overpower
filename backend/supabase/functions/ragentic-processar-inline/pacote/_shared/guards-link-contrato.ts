/**
 * Guards de link de contrato — impedem que bolha com link inventado ou placeholder
 * não resolvido chegue no lead.
 *
 * Por que existe: o modelo às vezes ESCREVE a URL do contrato de cabeça em vez de
 * chamar a tool `enviar_link_contrato`. O lead recebe um link que nunca existiu, não
 * consegue assinar, e ninguém percebe — o defeito viveu de 2026-05-25 a 2026-09-04.
 *
 * Módulo puro de propósito (zero import): dá pra testar sem subir Supabase nem Deno.
 * Testes em `tests/guards-link-contrato.test.ts`.
 */

/** Toda URL de um texto. Exclui fechadores pra não engolir o `]` de `[url](url)`. */
export const RE_URL = /https?:\/\/[^\s\]\)>"'`]+/gi;

/**
 * Única forma legítima de link de contrato: `<base>/contrato/<uuid>`.
 * Quem gera é a tool `enviar_link_contrato` — qualquer outra forma é alucinação.
 */
export const RE_CONTRATO_OK =
  /^https?:\/\/[^\/\s]+\/contrato\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;

/**
 * Colchete/chave/tag falando de link, contrato ou assinatura — a cara do placeholder
 * que o modelo esqueceu de resolver: `[LINK DO CONTRATO]`, `<emitir_link_contrato/>`,
 * `[TRIGGER_TEMPORAL: contrato_60min_primeira_cobranca]`.
 */
export const RE_PLACEHOLDER =
  /[\[\{<][^\]\}>\n]{0,60}(link|contrato|assinatura)[^\]\}>\n]{0,60}[\]\}>]/i;

/**
 * URL que fala de contrato/assinatura mas não tem a forma canônica.
 *
 * Julga URL por URL, não a bolha inteira: link de rifa, Instagram, Serasa ou checkout
 * numa mensagem que por acaso menciona contrato não é avaliado. Apara pontuação final
 * porque a frase costuma terminar em "." ou ")".
 */
export function urlDeContratoInvalida(url: string): boolean {
  const limpa = url.replace(/[.,;:!?)\]]+$/, "");
  if (!/contrato|assinatura/i.test(limpa)) return false;
  return !RE_CONTRATO_OK.test(limpa);
}

/**
 * Guard 1 — link de contrato inventado.
 *
 * A 1ª versão (2026-09-03) casava a FORMA da alucinação (`/contrato/` sem uuid no
 * CAMINHO) e deixava passar 3 das 6 alucinações do histórico, todas com "contrato" no
 * HOST: `contratos.exemplo.com/patricia`, `link-do-contrato.com` e
 * `link.contrato.exemplo/aldonir` — esta última chegou no lead Aldonir (tenant Diego)
 * em 2026-09-04 05:55 BRT.
 *
 * Agora é validação positiva: toda URL que fala de contrato/assinatura, no host OU no
 * caminho, tem que ser `<base>/contrato/<uuid>`.
 *
 * Host-agnóstico de propósito: allowlist de domínio quebraria TODO link legítimo no dia
 * que `APP_PUBLIC_URL` mudar — trocaria vazamento por apagão.
 */
export function temLinkContratoFantasma(conteudo: string): boolean {
  return (conteudo.match(RE_URL) ?? []).some(urlDeContratoInvalida);
}

/**
 * Guard 2 — placeholder não resolvido.
 *
 * A isenção pra colchete com URL dentro é obrigatória: markdown legítimo `[url](url)`
 * já saiu em produção e não pode ser barrado.
 *
 * Até 2026-09-04 a isenção era "tem QUALQUER http:// dentro do colchete" — buraco por
 * onde saiu `[Link do Contrato: https://link.contrato.exemplo/aldonir]`: a URL inventada
 * desligava este guard, e o guard 1 também não pegava (contrato no host). Cada um
 * isentou pelo motivo que o outro deveria cobrir. Agora só isenta se a URL de dentro do
 * colchete for um link de contrato VÁLIDO.
 */
export function temPlaceholderNaoResolvido(conteudo: string): boolean {
  const trecho = conteudo.match(RE_PLACEHOLDER)?.[0];
  if (!trecho) return false;
  const urls = trecho.match(RE_URL) ?? [];
  return urls.length === 0 || urls.some(urlDeContratoInvalida);
}

// _shared/canal-conversa.ts
// Fusão C1 / Fase 2 — derivação do CANAL da conversa (interno × externo) a
// partir da ORIGEM confiável (D1 do plano: nunca de param manipulável) +
// regra de elegibilidade de cargo por canal (espelha lab `chat.ts:247`).
//
// Fase 2 (esta): NÃO existe fonte interna ainda (Mentor/Admin = outro motor,
// `agente-mestre-chat`). Logo `derivarCanalConversa` SEMPRE resolve "externo"
// (fail-safe). O filtro de cargo passa de fixo (`!== "interno"`) pra
// condicional, mas com canal sempre "externo" o resultado é IDÊNTICO ao T3-edge
// atual — comportamento do motor externo byte-equivalente. A fonte interna real
// (conversa originada do commandbar do dono autenticado) pluga aqui na Fase 3.

export type CanalConversa = "externo" | "interno";

/**
 * Origem possível de uma conversa que chega ao motor. Campos derivados de
 * fonte confiável server-side — `body.canal` cru NÃO é considerado (D1).
 */
export type OrigemConversa = {
  // channel da conversa no banco ("teste" = Chat-Teste do dono simulando
  // cliente → ainda EXTERNO; whatsapp/zapi → externo).
  channelConversa?: string | null;
  // modo_teste do Chat-Teste: dono simulando CLIENTE → externo (não é canal
  // interno; o dono testa o comportamento externo do agente).
  modoTeste?: boolean;
  // Fase 3: sinal confiável de conversa interna (commandbar do dono autenticado,
  // identidade validada server-side). Inexistente na Fase 2 → undefined.
  origemInternaConfiavel?: boolean;
};

/**
 * Resolve o canal da conversa a partir da origem confiável.
 * Fase 2: só é "interno" se `origemInternaConfiavel === true` (sinal que
 * AINDA não é produzido por ninguém). Qualquer outra coisa, dúvida ou
 * ausência → "externo" (fail-safe: corta cargo interno).
 */
export function derivarCanalConversa(origem: OrigemConversa | null | undefined): CanalConversa {
  if (origem?.origemInternaConfiavel === true) return "interno";
  return "externo";
}

/**
 * Um cargo de `canal_atuacao` X é elegível numa conversa de canal Y?
 * - conversa "externo" → cargos `externo` ou `ambos` (qualquer valor que NÃO
 *   seja `interno`; idêntico ao filtro fixo do T3-edge — preserva default
 *   `ambos` e valores inesperados como elegíveis no externo).
 * - conversa "interno" → cargos `interno` ou `ambos` (NÃO `externo`).
 */
export function canalElegivel(canalCargo: string, canalConversa: CanalConversa): boolean {
  if (canalConversa === "interno") return canalCargo !== "externo";
  return canalCargo !== "interno";
}

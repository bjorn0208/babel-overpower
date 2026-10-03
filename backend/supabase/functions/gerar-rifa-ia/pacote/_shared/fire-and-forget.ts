/**
 * Helper de fire-and-forget cravado em **M003 Slice A9** (2026-05-07).
 *
 * Substitui o boilerplate de 4 linhas que aparecia 7× em `chat/index.ts` (e em outras edges):
 *
 * ```ts
 * // antes:
 * // deno-lint-ignore no-explicit-any
 * const ertX = (globalThis as any).EdgeRuntime;
 * if (ertX?.waitUntil) ertX.waitUntil(xPromise);
 * else xPromise.catch((e) => console.warn("[label] captura falhou:", (e as Error).message));
 *
 * // depois:
 * fireAndForget(xPromise, "label");
 * ```
 *
 * Comportamento:
 * - Em runtime de edge function (com `EdgeRuntime` global): usa `waitUntil` pra deixar a tarefa
 *   completar mesmo após `Response` ser retornado.
 * - Fora de edge runtime (testes locais, scripts): cai no `.catch` que loga warning sem propagar
 *   (ou silencia totalmente quando `opts.silent === true`, p.ex. quando o erro já foi logado upstream).
 *
 * Casos NÃO cobertos por esse helper (mantidos inline em `chat/index.ts`):
 * - Persistência de `prompts_mensagem` (linha ~1047): faz `await promPromise` no fallback pra
 *   garantir que o snapshot seja persistido em testes locais.
 * - Push de notificação (linha ~1086): tem `if (ert?.waitUntil)` SEM else, abandonando a promise
 *   silenciosamente fora do edge runtime — comportamento legado, slice própria.
 */
export function fireAndForget(
  promise: Promise<unknown>,
  label: string,
  opts?: { silent?: boolean },
): void {
  // deno-lint-ignore no-explicit-any
  const ert = (globalThis as any).EdgeRuntime;
  if (ert?.waitUntil) {
    ert.waitUntil(promise);
  } else if (opts?.silent) {
    promise.catch(() => { /* silenciado — erro já foi logado upstream */ });
  } else {
    promise.catch((e) => {
      console.warn(`[${label}] captura falhou:`, (e as Error).message);
    });
  }
}

/**
 * Helper de sessão do Chat-Teste.
 *
 * Cada sessão de teste precisa de um lead PRÓPRIO e zerado — senão o agente
 * herda fatos/tags de testes anteriores e não trata como 1º contato.
 * O `phone` carrega o timestamp da sessão pra garantir lead novo por sessão
 * (determinístico: reabrir a mesma sessão recupera o mesmo lead).
 */
export function gerarPhoneSessaoTeste(uid: string, sessaoTs: number): string {
  return `__chat_teste_${uid.slice(0, 8)}_${sessaoTs}__`;
}

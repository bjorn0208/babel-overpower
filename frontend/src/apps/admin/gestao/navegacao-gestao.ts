/**
 * Abrir um atendimento de outra aba — artefato `act("ver-impl")` (financeiro.html:3143): o botão de estado
 * da coluna Implementação, em Clientes, leva à aba Implementação JÁ com o atendimento aberto.
 *
 * O app não tinha ponte entre abas. Esta é a menor possível, sem mexer na casca (Gestao.tsx):
 *  1. guarda o pedido (aba + id) numa variável da janela;
 *  2. troca de aba pelo evento que a casca já escuta (`useAbaAlvo("gestao", …)` em Gestao.tsx:213, que só
 *     troca se a aba for permitida ao papel).
 * A aba de destino lê o pedido UMA vez ao montar, com `consumirAbertura("implementacao")`, e abre o registro.
 *
 * PENDENTE (outro agente, operação): `aba-implementacao.tsx` ainda não chama `consumirAbertura`. Enquanto não
 * chamar, o botão leva à aba Implementação mas não abre o atendimento sozinho.
 */

type AbaComAtendimento = "implementacao" | "programador" | "suporte" | "indicacoes";

interface PedidoAbertura {
  aba: AbaComAtendimento;
  id: string;
}

declare global {
  interface Window {
    __GESTAO_ABRIR_ATENDIMENTO?: PedidoAbertura;
  }
}

/** Troca para `aba` e deixa pedido para ela abrir o registro `id`. */
export function abrirAtendimentoEm(aba: AbaComAtendimento, id: string): void {
  window.__GESTAO_ABRIR_ATENDIMENTO = { aba, id };
  window.dispatchEvent(new CustomEvent("ragentic:ir-para-aba", { detail: { slug: "gestao", aba } }));
}

/** Para a aba de destino: devolve o id pedido (e apaga o pedido), ou null. */
export function consumirAbertura(aba: AbaComAtendimento): string | null {
  const p = window.__GESTAO_ABRIR_ATENDIMENTO;
  if (!p || p.aba !== aba) return null;
  window.__GESTAO_ABRIR_ATENDIMENTO = undefined;
  return p.id;
}

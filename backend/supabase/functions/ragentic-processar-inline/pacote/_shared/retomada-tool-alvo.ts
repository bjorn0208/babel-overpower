/**
 * Retomada da tool_alvo — traz o modelo de volta pra ferramenta que ele já tentou,
 * levou recusa, e consertou o motivo da recusa sem nunca tentar de novo.
 *
 * Por que existe: 2026-09-05, conversa f96a5c5b. O Porteiro classificou certo
 * (`enviar_link_contrato`, confiança 0.9), o modelo CHAMOU a tool, e ela recusou com
 * instrução — "o carrinho está vazio, chame buscar_produto e gerenciar_carrinho ANTES".
 * O modelo obedeceu (achou o produto, adicionou ao carrinho, os dois `ok`) e aí foi
 * redigir a resposta: escreveu "[Link do Contrato]" no lugar do link que nunca recebeu.
 *
 * A força de tool do DEC-038 valia só na 1ª iteração, então uma recusa COM conserto
 * deixava o turno órfão — ninguém trazia o modelo de volta. Aqui a recusa vira dívida:
 * assim que outra tool passa (sinal de pré-condição atendida), a tool_alvo é forçada
 * de novo.
 *
 * Módulo puro de propósito (zero import): dá pra testar sem subir Supabase nem Deno.
 * Testes em `tests/retomada-tool-alvo.test.ts`.
 */

/** Uma execução de ferramenta do turno, na ordem em que aconteceu. */
export type DesfechoTool = {
  nome: string;
  ok: boolean;
};

/**
 * Quantas vezes a tool_alvo pode ser re-forçada no mesmo turno.
 *
 * Era 1, e o smoke de 2026-09-05 01:37 mostrou por que não bastava: a pré-condição do
 * contrato leva DOIS passos (`buscar_produto` acha o produto, `gerenciar_carrinho` põe no
 * carrinho). Com teto 1, a retomada disparava logo após o `buscar_produto` — carrinho
 * ainda vazio —, tomava a segunda recusa e queimava a cota; o `gerenciar_carrinho` vinha
 * depois e já não havia crédito pra tentar de novo. Resultado: sem placeholder, mas
 * também sem link.
 *
 * Com 2, cada recusa nova zera o progresso e exige um conserto NOVO pra rearmar, então o
 * teto continua sendo o que impede laço — só que agora cabe uma pré-condição de dois
 * passos, que é a forma real do fluxo de contrato.
 */
export const MAX_REFORCO_TOOL_ALVO = 2;

/**
 * Situação da tool_alvo no turno até agora.
 *
 * `recusou` só conta a ÚLTIMA palavra da tool: se ela recusou e depois entregou,
 * `entregou` é true e a dívida está paga. `progresso` é o sinal de que a pré-condição
 * citada na recusa foi atendida — outra tool passou DEPOIS da recusa. Sem esse sinal,
 * re-forçar só faria a tool recusar de novo pelo mesmo motivo.
 */
export function resumoToolAlvo(toolAlvo: string | null, desfechos: DesfechoTool[]): {
  recusou: boolean;
  entregou: boolean;
  progresso: boolean;
} {
  if (!toolAlvo) return { recusou: false, entregou: false, progresso: false };

  let recusou = false;
  let entregou = false;
  let progresso = false;

  for (const d of desfechos) {
    if (d.nome === toolAlvo) {
      if (d.ok) {
        entregou = true;
        recusou = false;
        progresso = false;
      } else {
        recusou = true;
        // Progresso anterior não vale: o que conta é conserto DEPOIS desta recusa.
        progresso = false;
      }
      continue;
    }
    if (recusou && !entregou && d.ok) progresso = true;
  }

  return { recusou, entregou, progresso };
}

/**
 * Decide se a próxima iteração deve forçar `tool_choice` de volta na tool_alvo.
 *
 * Verdadeiro só quando a tool_alvo recusou, ainda não entregou, alguma outra tool passou
 * depois da recusa (pré-condição atendida) e o limite de retomadas do turno não estourou.
 */
export function precisaRetomarToolAlvo(
  toolAlvo: string | null,
  desfechos: DesfechoTool[],
  reforcosFeitos: number,
  max: number = MAX_REFORCO_TOOL_ALVO,
): boolean {
  if (!toolAlvo || reforcosFeitos >= max) return false;
  const { recusou, entregou, progresso } = resumoToolAlvo(toolAlvo, desfechos);
  return recusou && !entregou && progresso;
}

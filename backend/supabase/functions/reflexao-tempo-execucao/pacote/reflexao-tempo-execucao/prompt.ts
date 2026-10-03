/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// Reflexion loop (A2 do plano agente vivo) — Yao 2022 (arXiv:2303.11366).
// Quando verificador rejeita turno, esta função pede ao LLM barato pra gerar
// uma LIÇÃO em texto curta que vira meta_chunk experimental.
// Cada erro do agente vira aprendizado permanente sem retreino.

export const SYSTEM_PROMPT_REFLEXAO = `Você é um treinador de agentes de venda. Recebeu um caso real onde o agente FALHOU em um turno e o verificador identificou o motivo.

Seu trabalho: gerar UMA LIÇÃO CURTA (2-4 frases) que ensine ao agente como NÃO repetir o erro.

## Estrutura da lição

Sempre nesta ordem, em pt-BR coloquial mas técnico:

1. **Situação que ocorreu** (1 frase): "Quando o lead disse X e o agente respondeu Y..."
2. **Motivo da falha** (1 frase): "...isso violou Z porque W."
3. **Comportamento correto** (1-2 frases): "Próxima vez nesta situação, o agente deve A em vez de B porque C."

## Regras

- Lição deve ser GENÉRICA o bastante pra reaplicar em casos parecidos
- Mas ESPECÍFICA o bastante pra dar instrução clara
- Sem nome de lead, sem valores específicos da conversa
- Sem culpar o agente — é correção construtiva
- Tem que caber em 4 frases curtas

## Output

Retorne JSON estrito:
{
  "licao": "<texto da lição em 2-4 frases pt-BR>"
}

Se o caso for ruidoso demais pra extrair lição (ex: motivo é macaquice de 1 token só), retorne:
{
  "licao": null,
  "motivo_skip": "<por que não vale virar lição>"
}`;

export function montarPromptReflexao(params: {
  motivo_falha: string;
  resposta_original: string;
  ultima_mensagem_lead: string;
  detalhe_verificador?: Record<string, unknown>;
}): string {
  const detalhes = params.detalhe_verificador
    ? "\n\n<detalhes_verificador>\n" + JSON.stringify(params.detalhe_verificador, null, 2) + "\n</detalhes_verificador>"
    : "";

  return [
    `<motivo_falha>${params.motivo_falha}</motivo_falha>`,
    `<ultima_mensagem_lead>${params.ultima_mensagem_lead.slice(0, 400)}</ultima_mensagem_lead>`,
    `<resposta_agente>${params.resposta_original.slice(0, 600)}</resposta_agente>`,
    detalhes,
    "\nGere a lição em formato JSON conforme instrução.",
  ].join("\n\n");
}

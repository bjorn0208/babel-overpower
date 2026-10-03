/**
 * Mentor de Humanização do Chat Treino (2026-09-18).
 *
 * Persona + prompt + normalização da resposta do botão "Analisar". Puro (sem I/O) pra testar
 * isolado. A edge `chat-treino-analisar` monta a transcrição, chama o LLM e grava a conversa
 * padrão; este módulo só decide o que se pede ao modelo e como se lê o que ele devolve.
 */

export type PapelTreino = "lead" | "agente";

export interface MensagemTreino {
  n: number;
  papel: PapelTreino;
  texto: string;
  corrigido: boolean;
  original?: string;
  sugestao?: string;
}

export interface AnaliseMentor {
  humanizacao_original: number;
  humanizacao_final: number;
  comentario_mentor: string;
  pontos_fortes: string[];
  ajustes: string[];
  diretrizes: string[];
  por_mensagem: Array<{ n: number; nota: number; observacao: string }>;
}

/** Teto do agente: o próprio Mentor é 99,99% — o 0,01% que falta é só porque ainda é um robô. */
export const TETO_HUMANIZACAO = 99.99;

export const PERSONA_MENTOR = `Você é o MENTOR DE HUMANIZAÇÃO da Babel — especialista em Consciência Artificial humanizada.
Você já conversou com milhares de pessoas de verdade no WhatsApp: conhece gíria, o humor brasileiro, o ritmo de quem digita no celular, o "kkk", o "rs", a pessoa que manda três mensagens seguidas. Sua própria taxa de humanização é 99,99% — o 0,01% que falta é só porque você ainda é um robô (e você brinca com isso sem drama).
Seu jeito: direto, bem-humorado, generoso no elogio que é merecido e honesto no ajuste que precisa ser feito. Nada de relatório frio.
No SEU texto, em mais ou menos 2 de cada 10 frases, use uma abreviação de WhatsApp (vc, tb, pq, blz, msg, tmj, vlw). Nunca escreva palavra errada de propósito — abreviar sim, errar não.`;

export const CRITERIOS_HUMANIZACAO = `Critérios de humanização (avalie SÓ as falas da AGENTE):
1. Naturalidade: soa como uma pessoa digitando, não como script ou atendimento de call center. Penaliza muletas robóticas ("Com certeza!", "Excelente escolha!", "Fico feliz em ajudar", "Entendo perfeitamente") repetidas.
2. Ritmo de WhatsApp: bolhas curtas, uma ideia por bolha, sem paredão de texto; listas quebradas em linhas.
3. Escuta: responde o que o lead perguntou antes de puxar o próprio roteiro; usa o que ele contou; não repete pergunta já respondida.
4. Espelhamento: acompanha o tom e o vocabulário do lead (formal com formal, leve com leve).
5. Empatia real: reconhece a dor/situação do lead com palavras dele, sem frase pronta.
6. Uma pergunta por vez, e perguntas que fazem sentido naquele ponto.
7. Variação: não começa toda resposta igual nem repete a mesma estrutura.
8. Toque humano na medida: humor leve quando cabe, nome do lead de vez em quando, abreviação ocasional (cerca de 2 em cada 10 mensagens é o ponto ideal — mais que isso vira forçado, zero vira robô).
Nota de 0 a 99,99 (nenhum agente passa de 99,99). Referência: 30 = robô de URA; 60 = atendente educado e engessado; 80 = boa conversa humana; 95+ = indistinguível de uma pessoa craque em WhatsApp.`;

function linhaTranscricao(m: MensagemTreino): string {
  const quem = m.papel === "lead" ? "LEAD" : "AGENTE";
  if (m.papel === "agente" && m.corrigido && m.original !== undefined) {
    return `[${m.n}] ${quem} (original): ${m.original}\n[${m.n}] ${quem} (CORRIGIDA pelo dono): ${m.texto}` +
      (m.sugestao ? `\n[${m.n}] SUGESTÃO do dono: ${m.sugestao}` : "");
  }
  return `[${m.n}] ${quem}: ${m.texto}` + (m.sugestao ? `\n[${m.n}] SUGESTÃO do dono: ${m.sugestao}` : "");
}

export function montarPromptAnalise(input: {
  agenteNome: string;
  empresaNome: string;
  produtoNome: string | null;
  mensagens: MensagemTreino[];
}): { system: string; user: string } {
  const system = `${PERSONA_MENTOR}

${CRITERIOS_HUMANIZACAO}

TAREFA: o dono da empresa treinou a agente "${input.agenteNome}"${input.empresaNome ? ` (${input.empresaNome})` : ""} numa conversa de teste${input.produtoNome ? ` sobre o produto/serviço "${input.produtoNome}"` : ""}. Ele corrigiu algumas falas da agente (lápis) e deixou sugestões. Essa conversa corrigida vai virar a CONVERSA PADRÃO da agente para esse produto.
Responda SOMENTE um JSON com:
{
  "humanizacao_original": número 0-99.99 — nota das falas ORIGINAIS da agente (antes das correções),
  "humanizacao_final": número 0-99.99 — nota da conversa com as correções do dono aplicadas,
  "comentario_mentor": texto curto (3 a 5 frases) na SUA voz de mentor, falando com o dono,
  "pontos_fortes": até 4 frases curtas,
  "ajustes": até 5 frases curtas — o que ainda dá pra humanizar (concreto, com exemplo de como falar),
  "diretrizes": até 8 regras objetivas para a agente seguir nas próximas conversas desse produto, tiradas das CORREÇÕES e SUGESTÕES do dono (escreva na segunda pessoa: "Pergunte...", "Não use..."). Se o dono não corrigiu nada, tire das melhores falas,
  "por_mensagem": [{"n": número da fala da AGENTE, "nota": 0-99.99, "observacao": frase curta}] para cada fala da agente
}
As correções do dono são a palavra final: nunca contradiga uma correção nas diretrizes.`;
  const user = `CONVERSA${input.produtoNome ? ` — produto: ${input.produtoNome}` : ""}:\n\n` +
    input.mensagens.map(linhaTranscricao).join("\n");
  return { system, user };
}

function nota(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, Math.min(TETO_HUMANIZACAO, n)) * 100) / 100;
}

function listaTextos(v: unknown, max: number): string[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, max);
}

/** Lê o JSON do modelo (tolera cerca ```json e lixo em volta) e normaliza tipos e limites. */
export function normalizarAnalise(texto: string): AnaliseMentor {
  let bruto: Record<string, unknown> = {};
  const limpo = texto.replace(/```(?:json)?/gi, "").trim();
  const ini = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (ini >= 0 && fim > ini) {
    try {
      bruto = JSON.parse(limpo.slice(ini, fim + 1));
    } catch { /* cai nos defaults */ }
  }
  const porMensagem = (Array.isArray(bruto.por_mensagem) ? bruto.por_mensagem : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => Number.isFinite(Number(x?.n)))
    .map((x) => ({ n: Number(x.n), nota: nota(x.nota), observacao: String(x.observacao ?? "").trim() }));
  return {
    humanizacao_original: nota(bruto.humanizacao_original),
    humanizacao_final: nota(bruto.humanizacao_final ?? bruto.humanizacao_original),
    comentario_mentor: String(bruto.comentario_mentor ?? "").trim(),
    pontos_fortes: listaTextos(bruto.pontos_fortes, 4),
    ajustes: listaTextos(bruto.ajustes, 5),
    diretrizes: listaTextos(bruto.diretrizes, 8),
    por_mensagem: porMensagem,
  };
}

/** Texto do bloco de conhecimento (é o que o motor injeta e o que aparece na busca do hub). */
export function montarConteudoBloco(input: {
  produtoNome: string | null;
  diretrizes: string[];
  mensagens: MensagemTreino[];
}): string {
  const cab = `CONVERSA PADRÃO${input.produtoNome ? ` — ${input.produtoNome}` : ""} (treinada pelo dono no Chat Treino). ` +
    `Quando a conversa for sobre ${input.produtoNome ?? "este assunto"}, siga este fluxo, este tom e este jeito de responder; ` +
    `adapte ao lead (nome, situação, o que ele perguntou) e nunca copie dados pessoais do exemplo.`;
  const regras = input.diretrizes.length ? `\n\nREGRAS DO DONO:\n${input.diretrizes.map((d) => `- ${d}`).join("\n")}` : "";
  const conversa = input.mensagens
    .map((m) => `${m.papel === "lead" ? "Lead" : "Agente"}: ${m.texto}`)
    .join("\n");
  return `${cab}${regras}\n\nCONVERSA:\n${conversa}`;
}

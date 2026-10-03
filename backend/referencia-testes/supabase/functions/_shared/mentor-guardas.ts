/**
 * Guardas do Mentor (canal interno) — 2026-09-16.
 *
 * Duas causas de alucinação, as duas corrigidas aqui com TRAVA DE SERVIDOR, porque
 * regra de prompt não segura (lição de 2026-09-07, fuso duplo):
 *
 * 1. A via rápida (`mentor-resposta-rapida`) responde só com o histórico de conversas.
 *    A regra "dado vivo → FORA_DO_ESCOPO" era texto no prompt de um modelo leve e ele
 *    ignorava sempre que achava um número numa conversa velha — devolvendo, como fato de
 *    hoje, "como falamos em 09/09: 2.199 leads, 58 contratos" (21 respostas assim em 5
 *    contas desde 2026-08-26, com o número de contratos já desatualizado).
 *    `perguntaDeDadoVivo` barra a pergunta ANTES da LLM, e `respostaRepeteNumeroVelho`
 *    barra depois, se a resposta trouxer número que não foi perguntado agora.
 *
 * 2. O prompt do Mentor não dizia a data de hoje. Sem isso o modelo usa o ano do
 *    treinamento: em 16/09/2026 ele filtrou `created_at >= '2024-08-01'`, recebeu zero
 *    linha, tentou de novo com `EXTRACT(MONTH)=8` (sem ano) e estourou as 6 rodadas.
 *    `blocoTemporalBRT` entra no system prompt com hoje, ontem, mês atual e mês passado
 *    já calculados em BRT.
 */

const FUSO = "America/Sao_Paulo";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Partes da data corrente em BRT (sem depender do fuso do runtime). */
function partesBRT(agora: Date): { ano: number; mes: number; dia: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [ano, mes, dia] = fmt.format(agora).split("-").map(Number);
  return { ano, mes, dia };
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Bloco de data pro system prompt do Mentor. Traz o intervalo pronto de mês atual e
 * mês passado pra LLM não precisar calcular (nem chutar) ano nenhum.
 */
export function blocoTemporalBRT(agora: Date = new Date()): string {
  const { ano, mes, dia } = partesBRT(agora);
  const hoje = `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
  const ontemMs = Date.UTC(ano, mes - 1, dia) - 86400000;
  const o = new Date(ontemMs);
  const ontem = `${o.getUTCFullYear()}-${doisDigitos(o.getUTCMonth() + 1)}-${doisDigitos(o.getUTCDate())}`;
  const inicioMes = `${ano}-${doisDigitos(mes)}-01`;
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const inicioMesAnt = `${anoAnt}-${doisDigitos(mesAnt)}-01`;
  const fimMesAnt = new Date(Date.UTC(ano, mes - 1, 0));
  const fimMesAntStr = `${fimMesAnt.getUTCFullYear()}-${doisDigitos(fimMesAnt.getUTCMonth() + 1)}-${doisDigitos(fimMesAnt.getUTCDate())}`;

  return [
    `DATA DE HOJE (fuso de Brasília): ${hoje} (${MESES[mes - 1]} de ${ano}). Ontem: ${ontem}.`,
    `Mês atual = ${inicioMes} até ${hoje}. Mês passado (${MESES[mesAnt - 1]}) = ${inicioMesAnt} até ${fimMesAntStr}.`,
    `TODO filtro de data usa o ano corrente (${ano}) — nunca um ano do seu treinamento. ` +
      `Mês citado sem ano ("agosto") é o mais recente já passado com esse nome; escreva o ano explícito no SQL.`,
    `Número (contagem, soma, taxa, ranking) SEMPRE sai de consulta feita AGORA. ` +
      `Número citado em conversa anterior é histórico: pode ter mudado, então reconsulte antes de repetir.`,
  ].join("\n");
}

/* ────────────────────────────────────────────────────────────────────────────
   Gate da via rápida: a pergunta pede dado vivo do sistema?
   ──────────────────────────────────────────────────────────────────────────── */

/** Pede contagem/valor/lista/estado atual — só o banco responde. */
const PADROES_DADO_VIVO: RegExp[] = [
  /\bquant[oa]s?\b/i,
  /\bqual\s+(?:é\s+)?(?:o|a)\s+(?:total|n[úu]mero|m[ée]dia|taxa|percentual|valor|faturamento|receita|saldo|ticket)\b/i,
  /\b(?:total|m[ée]dia|somat[óo]ri[ao]|percentual|porcentagem|taxa)\s+de\b/i,
  /\btaxa\s+de\s+(?:convers[ãa]o|resposta|retorno|continuidade)\b/i,
  /\bconvers[ãa]o\b/i,
  /\bm[ée]tricas?\b/i,
  // Verbo de dinheiro na 1ª pessoa é sempre pergunta de número ("quanto vendi", "faturamos
  // bem?"). O radical solto ("vend\w*") não serve: pegava "quero subir campanha pra VENDER"
  // e "atendimentos de VENDA", que são conversa, não consulta (medido em 300 perguntas reais).
  /\b(?:vendi|vendemos|faturei|faturamos|recebi|recebemos|lucrei|lucramos|ganhei|ganhamos)\b/i,
  /\b(?:faturamento|receita|lucro|ticket\s+m[ée]dio|vendas?)\b.*\b(?:hoje|ontem|semana|m[êe]s|m[êe]ses|ano|per[íi]odo|total|at[ée]\s+agora|\d)/i,
  /\bquanto\s+(?:eu\s+)?(?:vendi|faturei|recebi|ganhei|entrou|custou|falta|tenho|gastei)\b/i,
  // Pedido de LISTA (mostrar/listar/abrir/ver) de algo do sistema. Precisa aceitar
  // todas as flexões: "mostre as conversas" ficou de fora do padrão antigo ("mostra")
  // e a via rápida respondeu repetindo o texto da resposta anterior, sem os cartões.
  /\b(?:mostr\w+|list\w+|exib\w+|ve[rj]a?|abr[ie]\w*|traz|traga|me\s+d[êe]|quais|quem)\b[\s\S]{0,40}\b(?:conversas?|atendimentos?|leads?|clientes?|contratos?|vendas?|pagamentos?|agendamentos?|or[çc]amentos?)\b/i,
  /\b(?:conversas?|atendimentos?)\b[\s\S]{0,30}\b(?:hoje|ontem|semana|m[êe]s|recentes?|abertas?|pendentes?|em\s+aberto|esperando|aguardando|human[oa]s?)\b/i,
  /\b(?:leads?|clientes?|contratos?|vendas?|pagamentos?|agendamentos?|consultas?)\b.*\b(?:hoje|ontem|semana|m[êe]s|per[íi]odo|agosto|setembro|outubro|novembro|dezembro|janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|\d{4})\b/i,
  /\b(?:ranking|top\s*\d+|melhor(?:es)?\s+(?:m[êe]s|dia|lead|cliente|vendedor))\b/i,
  /\bstatus\s+(?:d[oa]|atual)\b/i,
  /\b(?:cresc|caiu|subiu|aumentou|diminuiu)\w*\b.*\b(?:m[êe]s|semana|per[íi]odo|\d+%?)\b/i,
  /\bdashboard\b|\bkpi\b|\brelat[óo]rio\b/i,
];

/**
 * true = pergunta de dado vivo: a via rápida NÃO pode responder, mesmo que o histórico
 * traga um número parecido. Cai no motor profundo, que consulta o banco.
 */
export function perguntaDeDadoVivo(mensagem: string): boolean {
  const texto = (mensagem ?? "").trim();
  if (!texto) return false;
  return PADROES_DADO_VIVO.some((re) => re.test(texto));
}

/* ────────────────────────────────────────────────────────────────────────────
   Pós-checagem: a resposta da via rápida repete número de conversa velha?
   ──────────────────────────────────────────────────────────────────────────── */

/** Números que não são métrica: horas, datas, percentuais de texto solto, ordinais curtos. */
const RE_NUMERO = /(?<![\w.,])\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?%?/g;

/** "2.199" → 2199 · "2,64%" → 2.64 · "117,00" → 117 (comparação é por VALOR, não por texto). */
function valorNumerico(bruto: string): number {
  const n = bruto.replace("%", "").trim();
  const temVirgula = n.includes(",");
  const temPonto = n.includes(".");
  let normalizado = n;
  if (temVirgula && temPonto) normalizado = n.replace(/\./g, "").replace(",", ".");
  else if (temVirgula) normalizado = n.replace(",", ".");
  else if (temPonto && /\.\d{3}\b/.test(n)) normalizado = n.replace(/\./g, "");
  return Number(normalizado);
}

function numerosRelevantes(texto: string): number[] {
  const achados = texto.match(RE_NUMERO) ?? [];
  const valores: number[] = [];
  for (const bruto of achados) {
    const valor = valorNumerico(bruto);
    if (!Number.isFinite(valor)) continue;
    // 1 a 12 sozinho costuma ser mês ou quantidade trivial do texto ("1 conversa");
    // o que interessa aqui é métrica: contagem grande, dinheiro ou percentual.
    if (bruto.includes("%") || valor >= 13) valores.push(valor);
  }
  return valores;
}

/**
 * true = a resposta não parece português: nenhum acento e nenhuma palavra comum de PT.
 * O canal interno responde SEMPRE em pt-BR, então isso é scaffolding do modelo vazando
 * (em 2026-09-16 o Mentor devolveu "This tool call is not expected to fail. Use it
 * normally." como resposta inteira). Some texto curto de 1-2 palavras, que é ruído.
 */
export function respostaNaoParecePortugues(texto: string): boolean {
  const t = (texto ?? "").replace(/```[\s\S]*?```/g, " ").trim();
  if (t.split(/\s+/).length < 4) return false;
  if (/[áàâãéêíóôõúüç]/i.test(t)) return false;
  const pt =
    /\b(que|para|pra|com|uma|um|mas|como|mais|foi|foram|pelo|pela|isso|esse|essa|sem|dos|das|nos|nas|nao|sim|voce|hoje|ontem|lead|leads|cliente|clientes|contrato|contratos|reais|combinamos|falamos|conversa)\b/i;
  return !pt.test(t);
}

/**
 * true = a resposta trouxe número que a pergunta não trouxe. Na via rápida isso é sempre
 * número vindo de conversa passada: vira FORA_DO_ESCOPO e o motor profundo reconsulta.
 */
export function respostaRepeteNumeroVelho(pergunta: string, resposta: string): boolean {
  const naResposta = numerosRelevantes(resposta ?? "");
  if (naResposta.length === 0) return false;
  const naPergunta = numerosRelevantes(pergunta ?? "");
  return naResposta.some((n) => !naPergunta.some((p) => Math.abs(p - n) < 0.005));
}

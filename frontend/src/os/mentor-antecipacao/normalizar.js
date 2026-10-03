// Normalização da entrada do Mentor — duas camadas, ambas VISÍVEIS pro usuário
// (o texto muda na própria caixa, nunca por baixo dos panos). Porte do
// normalizar.js do Dominic Aknator.
//
//   1. ABREVIAÇÕES de chat ("vc", "qtos", "hj"…) expandem quando a palavra
//      FECHA (espaço/pontuação/Enter) — nunca no meio da digitação.
//   2. ERROS DE DIGITAÇÃO corrigem por distância de edição CONTRA O LÉXICO
//      ("campania"→"campanha") — corrigir rumo ao vocabulário que o motor
//      conhece evita trocar palavra certa por outra errada.
import { LEXICO } from './lexico.js';
import { normalize } from './motor.js';

/* ------------------------------------------------------------ abreviações */

export const ABREVIACOES = {
  vc: 'você', vcs: 'vocês', q: 'que', oq: 'o que', pq: 'porque',
  qnd: 'quando', qdo: 'quando', qto: 'quanto', qnto: 'quanto',
  qtos: 'quantos', qntos: 'quantos', qtas: 'quantas', qntas: 'quantas',
  hj: 'hoje', amh: 'amanhã', amnh: 'amanhã', agr: 'agora', dps: 'depois',
  mt: 'muito', mto: 'muito', td: 'tudo', tds: 'todos',
  n: 'não', nn: 'não', ss: 'sim', blz: 'beleza', vlw: 'valeu',
  obg: 'obrigado', pfv: 'por favor', pf: 'por favor',
  msg: 'mensagem', msgs: 'mensagens', tb: 'também', tbm: 'também',
  vlr: 'valor', pgto: 'pagamento', fin: 'financeiro', config: 'configurações',
};

/* ---------------------------------------------- vocabulário pra correção */

/** Expande um padrão do léxico nas strings que ele aceita (só `|`, `[..]`, `?`). */
export function expandirPadrao(pattern) {
  const alternativas = [];
  let atual = '';
  let dentroClasse = false;
  for (const ch of pattern) {
    if (ch === '[') dentroClasse = true;
    if (ch === ']') dentroClasse = false;
    if (ch === '|' && !dentroClasse) { alternativas.push(atual); atual = ''; continue; }
    atual += ch;
  }
  alternativas.push(atual);

  const saidas = [];
  for (const alt of alternativas) {
    let acc = [''];
    let i = 0;
    while (i < alt.length) {
      let opcoes;
      if (alt[i] === '[') {
        const fim = alt.indexOf(']', i);
        opcoes = [...alt.slice(i + 1, fim)];
        i = fim + 1;
      } else {
        opcoes = [alt[i]];
        i += 1;
      }
      const opcional = alt[i] === '?';
      if (opcional) i += 1;
      const proximo = [];
      for (const s of acc) {
        for (const o of opcoes) proximo.push(s + o);
        if (opcional) proximo.push(s);
      }
      acc = proximo;
    }
    saidas.push(...acc);
  }
  return saidas;
}

/** Toda palavra que o léxico reconhece — inclusive as de termos compostos. */
export const TERMOS = (() => {
  const set = new Set();
  for (const entrada of LEXICO)
    for (const forma of expandirPadrao(entrada.pattern))
      for (const palavra of forma.split(/\s+/)) if (palavra) set.add(palavra);
  return [...set].sort();
})();

const TERMOS_SET = new Set(TERMOS);

/** Levenshtein com teto: devolve 0/1/2 ou teto+1 (= "desisti"). */
export function distancia(a, b, teto = 2) {
  if (Math.abs(a.length - b.length) > teto) return teto + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let melhor = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < melhor) melhor = cur[j];
    }
    if (melhor > teto) return teto + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Alvos da correção: só termos de CONTEÚDO (app, objeto, tempo) com corpo
// (≥5 letras). Termo curto vira ímã de falso positivo; padrão de intenção
// expande formas fantasmas que corrompem verbo certo.
const CATS_CONTEUDO = new Set(['app', 'objeto', 'tempo']);
const ALVOS = (() => {
  const set = new Set();
  for (const entrada of LEXICO) {
    if (!CATS_CONTEUDO.has(entrada.cat)) continue;
    for (const forma of expandirPadrao(entrada.pattern))
      for (const palavra of forma.split(/\s+/))
        if (palavra.length >= 5 && !/\d/.test(palavra)) set.add(palavra);
  }
  return [...set];
})();

const INTOCAVEIS = new Set(['para', 'pelo', 'pela', 'como', 'esse', 'essa', 'isso', 'este', 'esta',
  'mais', 'menos', 'sobre', 'todo', 'toda', 'todos', 'todas', 'muito', 'muita', 'minha', 'meus',
  'ontem', 'hoje', 'agora', 'ainda', 'quero', 'pode', 'fazer', 'saber', 'tenho', 'temos', 'entre',
  'cada', 'outro', 'outra', 'coisa', 'gente', 'hora', 'horas', 'dia', 'dias', 'semana', 'favor',
  'porque', 'quanto', 'quanta', 'quantos', 'quantas', 'quando', 'quem']);

/** Corrige UMA palavra contra o léxico. Ambiguidade real = não mexe. */
export function corrigirPalavra(palavra) {
  const norm = normalize(palavra);
  if (norm.length < 4 || /\d/.test(norm)) return null;
  if (INTOCAVEIS.has(norm) || TERMOS_SET.has(norm)) return null;

  const teto = norm.length >= 8 ? 2 : 1;
  let melhor = null, melhorDist = teto + 1, empate = false;
  for (const t of ALVOS) {
    const d = distancia(norm, t, teto);
    if (d < melhorDist) { melhor = t; melhorDist = d; empate = false; }
    else if (d === melhorDist && t !== melhor) empate = true;
  }
  if (!melhor || melhorDist > teto || empate) return null;
  return melhor;
}

/* --------------------------------------------------------- texto inteiro */

const PALAVRA_RE = /[\p{L}\p{N}ñÑ]+/gu;

function trocarPalavra(palavra) {
  const chave = normalize(palavra);
  const expandida = ABREVIACOES[chave];
  if (expandida) return expandida;
  return corrigirPalavra(palavra) ?? palavra;
}

/**
 * Normaliza o texto todo. Com `finalizado: false` (digitação ao vivo), a
 * ÚLTIMA palavra só é tocada se já fechou com espaço/pontuação — palavra em
 * andamento é do usuário, não nossa.
 * @returns {{ texto: string, mudou: boolean }}
 */
export function normalizarTexto(texto, { finalizado = false } = {}) {
  const fechada = finalizado || /[\s.,;:!?]$/.test(texto);
  const partes = [...texto.matchAll(PALAVRA_RE)];
  const ultima = partes.at(-1);

  let saida = '';
  let cursor = 0;
  for (const m of partes) {
    saida += texto.slice(cursor, m.index);
    const emAndamento = m === ultima && !fechada;
    saida += emAndamento ? m[0] : trocarPalavra(m[0]);
    cursor = m.index + m[0].length;
  }
  saida += texto.slice(cursor);
  return { texto: saida, mudou: saida !== texto };
}

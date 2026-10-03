// Motor Anticipatory do Mentor — parser puro, sem DOM. Porte do engine.js do
// Dominic Aknator. Cada tecla vira: normalize → tag → plan. O plano só fica
// `ready` quando o motor tem CERTEZA (op local + âncora real no domínio);
// qualquer dúvida = ready:false e a frase segue pro Mentor LLM.
import { LEXICO, CATEGORIAS, OBJETOS } from './lexico.js';

/** Normaliza pra matching mantendo mapeamento 1:1 de índices com o original
 *  (NFD global mudaria o comprimento e desalinharia os spans). */
export function normalize(texto) {
  let saida = '';
  for (const ch of texto) {
    let n = ch.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    if ([...n].length !== 1) n = ch.toLowerCase();
    if ([...n].length !== 1) n = ch;
    saida += n;
  }
  return saida;
}

const COMPILADO = LEXICO.map((entrada) => ({
  ...entrada,
  re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${entrada.pattern})(?![\\p{L}\\p{N}])`, 'giu'),
}));

/** Extrai spans tageados, sem sobreposição: match mais longo vence; empate
 *  resolve pela prioridade da categoria. */
export function tag(texto) {
  const palheiro = normalize(texto);
  const achados = [];
  for (const entrada of COMPILADO) {
    entrada.re.lastIndex = 0;
    let m;
    while ((m = entrada.re.exec(palheiro)) !== null) {
      if (m[0].length === 0) { entrada.re.lastIndex++; continue; }
      achados.push({
        inicio: m.index, fim: m.index + m[0].length,
        cat: entrada.cat, texto: texto.slice(m.index, m.index + m[0].length),
        op: entrada.op, value: entrada.value,
        tabela: entrada.tabela, filtroExtra: entrada.filtroExtra,
        prio: CATEGORIAS[entrada.cat].prioridade,
      });
    }
  }
  achados.sort((a, b) => a.inicio - b.inicio || (b.fim - b.inicio) - (a.fim - a.inicio) || a.prio - b.prio);
  const spans = [];
  let cursor = -1;
  for (const s of achados) {
    if (s.inicio < cursor) continue;
    spans.push(s);
    cursor = s.fim;
  }
  return spans;
}

// "quantos clientes" — a tag pinta APP (empate resolve pra app), mas com op
// count o sentido é a ENTIDADE. Este mapa devolve o objeto equivalente.
const OBJETO_DO_APP = {
  clientes: 'clientes', conversas: 'conversas', campanha: 'campanhas',
  rifas: 'rifas', contratos: 'contratos', consulta: 'consultas',
  reuniao: 'reunioes', estoque: 'estoque', agenda: 'eventos',
};
const OBJ_POR_VALOR = Object.fromEntries(OBJETOS.map((o) => [o.v, o]));

// Só estas operações têm caminho local. list/rank/summarize são reconhecidas
// (pintam tag, ajudam cobertura) mas caem no LLM — o motor não improvisa.
const OPS_LOCAIS = new Set(['count', 'abrir', 'meta']);
const PESO_OP = { list: 0, count: 1, abrir: 2, rank: 3, summarize: 3, meta: 9 };

/** Converte spans num plano de execução determinístico. */
export function plan(texto) {
  const spans = tag(texto);
  let op = null, meta = null, app = null, objeto = null, janelaTempo = null, dimNovo = false, statusFiltro = false, statusFiltroTexto = '';
  const mencionado = new Set();

  for (const s of spans) {
    if (s.cat === 'meta')     { op = 'meta'; meta = s.value; continue; }
    if (s.cat === 'intencao') { if (!op || PESO_OP[s.op] > PESO_OP[op]) op = s.op; continue; }
    if (s.cat === 'tempo')    { if (!janelaTempo) janelaTempo = s.value; mencionado.add('tempo'); continue; }
    if (s.cat === 'app')      { if (!app) app = s.value; mencionado.add('app'); continue; }
    if (s.cat === 'objeto')   { if (!objeto) objeto = s.value; mencionado.add('objeto'); continue; }
    if (s.cat === 'dimensao') {
      if (s.value === 'novo') dimNovo = true;
      if (s.value === 'status_filtro') { statusFiltro = true; statusFiltroTexto = normalize(s.texto); }
      mencionado.add('dimensao');
      continue;
    }
  }

  // count com app que na verdade é entidade ("quantos clientes")
  if (op === 'count' && !objeto && app && OBJETO_DO_APP[app]) {
    objeto = OBJETO_DO_APP[app];
    app = null;
  }

  // Exceção com caminho local: "contratos ASSINADOS" tem critério exato no
  // app (status ∈ assinado/signed) — vira filtro em vez de cair no LLM.
  // Fonte da verdade = a mesma da tela de Contratos: mês por created_at.
  let filtroExtraOverride = null;
  if (op === 'count' && objeto === 'contratos' && statusFiltro && /^assinad/.test(statusFiltroTexto)) {
    filtroExtraOverride = 'contrato_assinado';
    statusFiltro = false;
  }

  // Cobertura léxica: fração da frase coberta por spans. Frase livre que só
  // cita entidade de passagem ("por que meus leads sumiram?") → LLM.
  const cobertura = spans.reduce((a, s) => a + (s.fim - s.inicio), 0) / (texto.trim().length || 1);

  // Trava anti-chute (mesma do Dominic): interrogativo genérico sem âncora
  // real não executa nada local. "quantos anos tem o Pelé" → LLM.
  const temAncora = (op === 'abrir' && !!app) || (op === 'count' && !!objeto) || op === 'meta';

  // 'novos' sem janela seria contagem total com rótulo errado → LLM.
  const novoSemJanela = dimNovo && op === 'count' && !janelaTempo;
  // filtro de status ("abertos", "pendentes") que o executor não aplica → LLM.
  const contagemComStatus = statusFiltro && op === 'count';

  const ready = Boolean(op) && OPS_LOCAIS.has(op) && temAncora && !novoSemJanela && !contagemComStatus && (op === 'meta' || cobertura >= 0.5);
  const objDef = objeto ? OBJ_POR_VALOR[objeto] : null;

  return {
    spans, op, meta, app,
    objeto, tabela: objDef?.tabela ?? null, filtroExtra: filtroExtraOverride ?? objDef?.filtroExtra ?? null,
    semDeletedAt: objDef?.semDeletedAt ?? false,
    janelaTempo, cobertura: +cobertura.toFixed(2), ready,
    steps: montarSteps({ op, meta, app, objeto, objDef, janelaTempo, filtroExtra: filtroExtraOverride ?? objDef?.filtroExtra ?? null }),
  };
}

/** O plano legível do painel: cada operação e filtro vira um card. */
function montarSteps({ op, meta, app, objeto, objDef, janelaTempo, filtroExtra }) {
  if (!op) return [];
  if (op === 'meta')  return [{ passo: 'Consulta ao Mundo', desc: `META ${meta}` }];
  if (op === 'abrir') return app ? [{ passo: 'Abrir App', desc: `LAUNCH ${app}` }] : [];
  const steps = [];
  if (op === 'count' && objDef) {
    steps.push({ passo: 'Motor de Agregação', desc: `COUNT(*) FROM ${objDef.tabela}` });
    steps.push({ passo: 'Isolamento Tenant',  desc: 'WHERE tenant_id = você (RLS + filtro explícito)' });
    if (filtroExtra === 'cliente') steps.push({ passo: 'Filtro de Cliente', desc: 'WHERE client_stage IS NOT NULL' });
    if (filtroExtra === 'contrato_assinado') steps.push({ passo: 'Filtro de Status', desc: "WHERE status IN ('assinado','signed')" });
    if (janelaTempo) steps.push({ passo: 'Janela Temporal', desc: `created_at ∈ ${janelaTempo}` });
  }
  if (['list', 'rank', 'summarize'].includes(op))
    steps.push({ passo: 'Fora do léxico local', desc: `${op.toUpperCase()} → Mentor (LLM)` });
  return steps;
}

/** Resolve a janela temporal contra o relógio local (BRT do usuário). */
export function janela(valor, refMs = Date.now()) {
  if (!valor || valor === 'tudo') return null;
  const ref = new Date(refMs);
  const dia = 86400000;
  const inicioDoDia = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  switch (valor) {
    case 'hoje':   return [inicioDoDia, inicioDoDia + dia];
    case 'ontem':  return [inicioDoDia - dia, inicioDoDia];
    case 'semana': return [inicioDoDia - 6 * dia, inicioDoDia + dia];
    case 'mes':    return [new Date(ref.getFullYear(), ref.getMonth(), 1).getTime(), inicioDoDia + dia];
    case 'semana_passada': {
      // semana civil anterior: segunda 00:00 → segunda 00:00
      const diaSemana = (ref.getDay() + 6) % 7; // 0 = segunda
      const inicioSemanaAtual = inicioDoDia - diaSemana * dia;
      return [inicioSemanaAtual - 7 * dia, inicioSemanaAtual];
    }
    case 'mes_passado': return [
      new Date(ref.getFullYear(), ref.getMonth() - 1, 1).getTime(),
      new Date(ref.getFullYear(), ref.getMonth(), 1).getTime(),
    ];
    case 'ano':    return [new Date(ref.getFullYear(), 0, 1).getTime(), inicioDoDia + dia];
    case 'ano_passado': return [
      new Date(ref.getFullYear() - 1, 0, 1).getTime(),
      new Date(ref.getFullYear(), 0, 1).getTime(),
    ];
    case 'd7':     return [refMs - 7 * dia, refMs];
    case 'd30':    return [refMs - 30 * dia, refMs];
    case 'd90':    return [refMs - 90 * dia, refMs];
    default: {
      // mes_1..mes_12 — mês nomeado do ano corrente; futuro → ano passado
      const m = /^mes_(\d{1,2})$/.exec(valor);
      if (m) {
        const mesIdx = Number(m[1]) - 1;
        let ano = ref.getFullYear();
        if (new Date(ano, mesIdx, 1).getTime() > refMs) ano -= 1;
        return [new Date(ano, mesIdx, 1).getTime(), new Date(ano, mesIdx + 1, 1).getTime()];
      }
      return null;
    }
  }
}

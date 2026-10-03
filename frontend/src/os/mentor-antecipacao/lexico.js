// Léxico do motor Anticipatory do Mentor. Fonte ÚNICA de verdade: as tags do
// painel de mapeamento, o plano e as respostas locais derivam daqui — nunca de
// regex duplicados. Padrões escritos SEM acento (o texto é normalizado antes).
//
// Porte do Dominic Aknator (motor Anticipatory-V2) pro domínio do OS:
// o motor local só responde o que o léxico fechado cobre (abrir app, contagem
// de entidades do tenant, meta). Todo o resto declara ready=false e segue o
// caminho atual do Mentor (LLM) — o motor nunca chuta.

export const CATEGORIAS = {
  meta:        { rotulo: 'META',      prioridade: 0 },
  intencao:    { rotulo: 'INTENÇÃO',  prioridade: 1 },
  tempo:       { rotulo: 'TEMPO',     prioridade: 2 },
  app:         { rotulo: 'APP',       prioridade: 3 },
  objeto:      { rotulo: 'OBJETO',    prioridade: 4 },
  dimensao:    { rotulo: 'DIMENSÃO',  prioridade: 6 },
};

/* Apps do OS (lado user) — "abre a agenda" abre na hora, sem LLM. */
export const APPS = [
  { v: 'agenda',        p: 'agenda|calendario' },
  { v: 'caixa',         p: 'financeiro|caixa|fluxo de caixa' },
  { v: 'clientes',      p: 'clientes' },
  { v: 'conversas',     p: 'conversas|atendimentos?|whatsapp|zap' },
  { v: 'campanha',      p: 'campanhas?' },
  { v: 'contratos',     p: 'contratos?' },
  { v: 'equipe',        p: 'equipe|time' },
  { v: 'estoque',       p: 'estoque' },
  { v: 'produtos',      p: 'produtos?|catalogo' },
  { v: 'loja',          p: 'loja' },
  { v: 'marketing',     p: 'marketing' },
  { v: 'rh',            p: 'rh|recursos humanos' },
  { v: 'juridico',      p: 'juridico' },
  { v: 'notas',         p: 'notas?' },
  { v: 'email',         p: 'e ?-?mails?' },
  { v: 'reuniao',       p: 'reunioes|reuniao' },
  { v: 'agente',        p: 'agente' },
  { v: 'base',          p: 'base|crm' },
  { v: 'consulta',      p: 'consultas?' },
  { v: 'contabilidade', p: 'contabilidade' },
  { v: 'credito',       p: 'credito bancario|credito' },
  { v: 'rifas',         p: 'rifas?' },
  { v: 'calculadora',   p: 'calculadora' },
  { v: 'configuracoes', p: 'configuracoes|ajustes' },
  { v: 'empresa',       p: 'empresa' },
  { v: 'mentor',        p: 'mentor' },
];

/* Entidades que o motor conta direto no banco (tenant_id + RLS).
   `tabela`/`filtroExtra` guiam o executor; `semDeletedAt` marca tabela sem
   soft-delete. `mensagens` ficou de fora da V1 (não tem tenant_id — conta via
   conversa, fica pro LLM). Auditoria 2026-08-25: todas as tabelas abaixo têm
   tenant_id + created_at confirmados no schema. */
export const OBJETOS = [
  { v: 'leads',     p: 'leads?',            tabela: 'leads' },
  { v: 'clientes',  p: 'clientes?',         tabela: 'leads', filtroExtra: 'cliente' },
  { v: 'conversas', p: 'conversas?',        tabela: 'conversas', semDeletedAt: true },
  { v: 'campanhas', p: 'campanhas?',        tabela: 'campanhas' },
  { v: 'rifas',     p: 'rifas?',            tabela: 'rifas' },
  { v: 'pedidos',   p: 'pedidos?',          tabela: 'pedidos_rifa', semDeletedAt: true },
  { v: 'contratos', p: 'contratos?',        tabela: 'contratos', semDeletedAt: true },
  { v: 'consultas', p: 'consultas?',        tabela: 'consultas' },
  { v: 'eventos',   p: 'eventos?|compromissos?|agendamentos?', tabela: 'eventos_agenda' },
  { v: 'estoque',   p: 'itens (?:de |do |no )?estoque|itens', tabela: 'estoque_itens' },
  { v: 'reunioes',  p: 'reunioes|reuniao|salas de reuniao',   tabela: 'salas_reuniao' },
  { v: 'tickets',   p: 'tickets?|chamados?', tabela: 'tickets_conversa', semDeletedAt: true },
];

export const LEXICO = [
  // --- meta: sobre o mundo e o próprio motor --------------------------
  { cat: 'meta', pattern: 'que dia e hoje|qual e a data de hoje|qual a data de hoje|que data e hoje|data de hoje', op: 'meta', value: 'data' },
  { cat: 'meta', pattern: 'que horas sao|que hora e|hora certa|horario atual', op: 'meta', value: 'hora' },
  { cat: 'meta', pattern: 'o que voce faz|o que voce sabe fazer|o que posso perguntar|como funciona|me ajuda|ajuda|comandos', op: 'meta', value: 'ajuda' },
  { cat: 'meta', pattern: 'quem e voce|voce e uma ia|qual seu nome', op: 'meta', value: 'identidade' },

  // --- intenção -------------------------------------------------------
  { cat: 'intencao', pattern: 'quantas?|quantos?', op: 'count' },
  { cat: 'intencao', pattern: 'quantidade de|numero de|total de|no total', op: 'count' },
  { cat: 'intencao', pattern: 'conte|contar|conta', op: 'count' },
  { cat: 'intencao', pattern: 'tem alg[um]?[mn]?s?|existem?|ha quantos', op: 'count' },
  { cat: 'intencao', pattern: 'abra|abre|abrir|inicia|iniciar|lanca|lancar|entra no|entrar no|vai pro|vai para o', op: 'abrir' },
  // intenções reconhecidas mas SEM caminho local — pintam a tag e caem no LLM
  { cat: 'intencao', pattern: 'liste|listar|lista|mostre|mostrar|mostra|exiba|exibir', op: 'list' },
  { cat: 'intencao', pattern: 'resumo|resuma|resumir|panorama|visao geral|relatorio|dashboard', op: 'summarize' },
  { cat: 'intencao', pattern: 'mais recentes?|mais novos?|top|ranking|principais', op: 'rank' },

  // --- tempo ----------------------------------------------------------
  { cat: 'tempo', pattern: 'hoje',        value: 'hoje' },
  { cat: 'tempo', pattern: 'ontem',       value: 'ontem' },
  { cat: 'tempo', pattern: 'esta semana|essa semana|nesta semana|nessa semana|semana atual|na semana', value: 'semana' },
  { cat: 'tempo', pattern: 'este mes|esse mes|neste mes|nesse mes|mes atual|no mes|do mes', value: 'mes' },
  // formas com preposição vêm ANTES no padrão: "no mes passado" precisa vencer
  // o span "no mes" (mesmo início, match mais longo ganha).
  { cat: 'tempo', pattern: 'na semana passada|semana passada|na ultima semana|ultima semana', value: 'semana_passada' },
  { cat: 'tempo', pattern: 'no mes passado|mes passado|no ultimo mes|ultimo mes', value: 'mes_passado' },
  { cat: 'tempo', pattern: 'este ano|esse ano|neste ano|nesse ano|ano atual|no ano|do ano', value: 'ano' },
  { cat: 'tempo', pattern: 'no ano passado|ano passado|no ultimo ano|ultimo ano', value: 'ano_passado' },
  { cat: 'tempo', pattern: 'ultimos 7 dias|7 dias', value: 'd7' },
  { cat: 'tempo', pattern: 'ultimos 30 dias|30 dias', value: 'd30' },
  { cat: 'tempo', pattern: 'ultimos 90 dias|90 dias|ultimo trimestre|no trimestre', value: 'd90' },
  { cat: 'tempo', pattern: 'sempre|todo o periodo|desde o inicio|no total geral', value: 'tudo' },
];

// Meses nomeados — "contratos assinados em agosto". Ano corrente; se o mês
// ainda não chegou este ano, o motor resolve pro ano passado (motor.js).
export const MESES_NOME = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
MESES_NOME.forEach((nome, i) => {
  LEXICO.push({ cat: 'tempo', pattern: `em ${nome}|de ${nome}|${nome}`, value: `mes_${i + 1}` });
});

for (const x of OBJETOS) LEXICO.push({ cat: 'objeto', pattern: x.p, value: x.v, tabela: x.tabela, filtroExtra: x.filtroExtra, semDeletedAt: x.semDeletedAt });
// app entra DEPOIS de objeto: em empate de comprimento, prioridade menor vence
// (CATEGORIAS.app = 3 < objeto = 4), então "abre clientes" pinta APP e
// "quantos clientes" pinta OBJETO via regra do plano (op decide o sentido).
for (const x of APPS) LEXICO.push({ cat: 'app', pattern: x.p, value: x.v });

// dimensões genéricas — reconhecidas só pra cobertura; nunca ancoram sozinhas.
// 'novo' é especial: "leads novos esse mês" = count na janela (correto), mas
// "leads novos" SEM janela seria contagem total rotulada errado → o plano
// exige janela quando 'novo' aparece (regra no motor.js).
for (const [pattern, value] of [
  ['dias?|datas?', 'dia'],
  ['status|situacao', 'status'],
  ['nov[oa]s?|cadastrad[oa]s?|criad[oa]s?|registrad[oa]s?', 'novo'],
  ['abert[oa]s?|ativ[oa]s?|pendentes?|fechad[oa]s?|concluid[oa]s?|pag[oa]s?|vencid[oa]s?|assinad[oa]s?|rejeitad[oa]s?|validad[oa]s?', 'status_filtro'],
  ['temos|tenho|a gente tem|nos temos', 'posse'],
])
  LEXICO.push({ cat: 'dimensao', pattern, value });

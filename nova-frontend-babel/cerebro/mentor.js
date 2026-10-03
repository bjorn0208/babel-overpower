// Cérebro Babel — o Mentor: responde sobre os dados reais de quem pergunta.
// Com chave da Groq: IA com ferramentas (abrir tela, consultar o banco, buscar na web, lembrar).
// Sem chave: respostas prontas sobre o retrato real (dinheiro, agenda, conversas, clientes, produtos…).
'use strict';

const { retrato, reais, diaBR, quandoBR, horaBR, curto } = require('./retrato');
const supa = require('./supa');
const memoria = require('./memoria');
const TELAS = require('./telas');

const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const HIST = new Map(); // uid → { em, msgs:[{role,content}], intencao }
function sessao(uid) {
  const s = HIST.get(uid);
  if (s && Date.now() - s.em < 30 * 60 * 1000) return s;
  const n = { em: Date.now(), msgs: [], intencao: null };
  HIST.set(uid, n);
  return n;
}
const lista = (arr, n, f) => { const a = arr.slice(0, n).map(f); return a.length > 1 ? a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1] : (a[0] || ''); };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// ---------- telas ----------
function acharTela(q) {
  const t = sem(q);
  let melhor = null;
  for (const [id, nome, apelidos] of TELAS) {
    for (const k of [sem(nome), id, ...(apelidos || []).map(sem)]) {
      if (k && new RegExp(`(^|\\W)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(t) && (!melhor || k.length > melhor.k.length)) melhor = { id, nome, k };
    }
  }
  return melhor;
}

// ---------- perguntas prontas sobre o retrato ----------
function periodo(t) {
  if (/\bontem\b/.test(t)) return 'ontem';
  if (/semana|7 dias|sete dias/.test(t)) return 'semana';
  if (/\bmes\b|30 dias|trinta dias/.test(t)) return /30|trinta/.test(t) ? '30' : 'mes';
  if (/\bhoje\b/.test(t)) return 'hoje';
  return null;
}
// tópico específico primeiro; "resumo" e "oi" só quando nada mais casou
const REGRAS = [
  ['hora', /que horas|que dia (e|eh) hoje|data de hoje|dia de hoje/],
  ['chamados', /chamado|ticket/],
  ['tarefas', /tarefa/],
  ['plataforma', /tenant|clientes da babel|plataforma/],
  ['empresa', /minha empresa|endereco|horario de funcionamento|cnpj da empresa/],
  ['conversas', /conversa|mensag|whats|quem (falou|mandou|chamou|escreveu)|atendiment/],
  ['entrou', /entrou|recebi|recebemos|recebido|faturei|faturamos|faturamento|caixa|quanto (eu )?ganhei|vendi|vendemos|receita/],
  ['receber', /a receber|devendo|me deve|devem|atrasad|vencid|vence|cobran|inadimpl|em aberto|pendente de pagamento/],
  ['agenda', /agenda|compromisso|reuni|marcad|evento|prova|visita|amanha|horario/],
  ['leads', /lead|interessad|prospect|contato novo/],
  ['clientes', /cliente/],
  ['contratos', /contrat/],
  ['estoque', /estoque|acabando|repor|reposicao|unidades/],
  ['produtos', /produto|preco|quanto custa|catalogo|vitrine|o que (eu )?vendo/],
  ['notas', /nota|lembrete|anotac|anotei/],
  ['campanhas', /campanha/],
  ['rifas', /rifa|sorteio/],
  ['consultas', /consulta|saldo de cpf|cpf|cnpj/],
  ['duvidas', /duvida|nao soube|nao sabe|sem resposta/],
  ['agente', /agente|robo|atendente virtual/],
  ['empresa', /empresa|cidade/],
  ['resumo', /pede voce|precisa de mim|pedem voce|me chamou|pendent|o que (eu )?(tenho|faco|preciso)|resumo|como (esta|estamos|vai|anda)|novidade|prioridade|urgente|o que ha|o que tem/],
];
function intencao(t) {
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa|hey|fala)\b/.test(t) && t.split(' ').length <= 4) return 'oi';
  const r = REGRAS.find(([, re]) => re.test(t));
  return r ? r[0] : null;
}

function resumo(r) {
  const p = [];
  const hum = r.conversas.filter((c) => c.lead.humano);
  if (hum.length) p.push(`${plural(hum.length, 'conversa pede', 'conversas pedem')} você: ${lista(hum, 3, (c) => c.lead.nome)}`);
  if (r.fin.vencidas.length) p.push(`${plural(r.fin.vencidas.length, 'cobrança atrasada', 'cobranças atrasadas')}, somando ${reais(r.fin.vencidas.reduce((a, x) => a + x.valor, 0))}`);
  if (r.fin.hoje.length) p.push(`${plural(r.fin.hoje.length, 'cobrança vence', 'cobranças vencem')} hoje`);
  const h0 = new Date(); h0.setHours(0, 0, 0, 0); const h1 = new Date(h0); h1.setDate(h1.getDate() + 1);
  const ag = r.agenda.filter((e) => new Date(e.inicio) >= h0 && new Date(e.inicio) < h1);
  if (ag.length) p.push(`${plural(ag.length, 'compromisso', 'compromissos')} hoje, o primeiro às ${horaBR(ag[0].inicio)}: ${ag[0].titulo}`);
  if (r.estoque.baixo.length) p.push(`${plural(r.estoque.baixo.length, 'item', 'itens')} do estoque abaixo do mínimo`);
  if (r.duvidas.length) p.push(`o agente não soube responder ${plural(r.duvidas.length, 'pergunta', 'perguntas')}`);
  if (r.admin) {
    if (r.admin.chamados.total) p.push(`${plural(r.admin.chamados.total, 'chamado aberto', 'chamados abertos')} no suporte`);
    if (r.admin.pedidos.total) p.push(`${plural(r.admin.pedidos.total, 'pedido de compra', 'pedidos de compra')} para aprovar`);
  }
  return p;
}

function responderLocal(q, r, s) {
  const t = sem(q);
  let it = intencao(t);
  const per = periodo(t);
  if (!it && per && s.intencao) it = s.intencao; // "e ontem?" depois de "quanto entrou hoje?"
  if (it) s.intencao = it;
  const nome = (r.eu.nome || '').split(' ')[0];
  switch (it) {
    case 'hora': { const d = new Date(); return `Agora são ${horaBR(d.toISOString())} de ${r.hoje}.`; }
    case 'oi': { const p = resumo(r); return `Oi${nome ? ', ' + nome : ''}! ` + (p.length ? 'Por aqui: ' + p.slice(0, 3).join('; ') + '.' : 'Está tudo tranquilo por aqui. Quer saber do caixa ou da agenda?'); }
    case 'resumo': { const p = resumo(r); return p.length ? 'O que precisa de você agora: ' + p.join('; ') + '.' : 'Nada pede você agora: sem cobrança atrasada, sem conversa esperando e agenda livre hoje.'; }
    case 'entrou': {
      const f = r.fin;
      const v = per === 'ontem' ? ['ontem', f.recebidoOntem] : per === 'semana' ? ['nos últimos 7 dias', f.recebido7] : per === '30' ? ['nos últimos 30 dias', f.recebido30] : per === 'mes' ? ['neste mês', f.recebidoMes] : ['hoje', f.recebidoHoje];
      let fala = `Entrou ${reais(v[1])} ${v[0]}.`;
      if (!per) fala += ` Ontem foram ${reais(f.recebidoOntem)} e no mês ${reais(f.recebidoMes)}.`;
      if (f.recebidas.length) fala += ` Último recebimento: ${f.recebidas[0].quem || f.recebidas[0].desc}, ${reais(f.recebidas[0].valor)} ${quandoBR(f.recebidas[0].em)}.`;
      return fala;
    }
    case 'receber': {
      const f = r.fin;
      let fala = `Você tem ${reais(f.aReceber)} a receber.`;
      if (f.vencidas.length) fala += ` Atrasadas: ${lista(f.vencidas, 4, (x) => `${x.quem || x.desc} ${reais(x.valor)}, desde ${diaBR(x.venc)}`)}.`;
      else fala += ' Nada atrasado.';
      if (f.hoje.length) fala += ` Vence hoje: ${lista(f.hoje, 3, (x) => `${x.quem || x.desc} ${reais(x.valor)}`)}.`;
      else if (f.proximas.length) fala += ` A próxima é ${f.proximas[0].quem || f.proximas[0].desc}, ${reais(f.proximas[0].valor)} em ${diaBR(f.proximas[0].venc)}.`;
      return fala;
    }
    case 'agenda': {
      const h0 = new Date(); h0.setHours(0, 0, 0, 0);
      const dia = /amanha/.test(t) ? 1 : 0, semana = /semana|proximos dias/.test(t);
      const ini = new Date(h0); ini.setDate(ini.getDate() + dia); const fim = new Date(ini); fim.setDate(fim.getDate() + (semana ? 7 : 1));
      const ev = r.agenda.filter((e) => new Date(e.inicio) >= ini && new Date(e.inicio) < fim && e.status !== 'cancelado');
      const quando = semana ? 'nos próximos 7 dias' : dia ? 'amanhã' : 'hoje';
      if (!ev.length) { const prox = r.agenda.find((e) => new Date(e.inicio) >= fim && e.status !== 'cancelado'); return `Sua agenda está livre ${quando}.` + (prox ? ` O próximo compromisso é ${prox.titulo}, ${quandoBR(prox.inicio)}.` : ''); }
      return `${quando[0].toUpperCase() + quando.slice(1)} você tem ${plural(ev.length, 'compromisso', 'compromissos')}: ${lista(ev, 6, (e) => `${semana ? quandoBR(e.inicio) : 'às ' + horaBR(e.inicio)}, ${e.titulo}`)}.`;
    }
    case 'conversas': {
      const hum = r.conversas.filter((c) => c.lead.humano);
      if (/pede|precisa|esperando|aguardando/.test(t) && hum.length) return `Pedem você: ${lista(hum, 5, (c) => c.lead.nome + (c.ultimas[0] ? `, que disse "${curto(c.ultimas[0].texto, 60)}"` : ''))}.`;
      if (!r.conversas.length) return 'Ainda não há conversas.';
      return `As conversas mais recentes: ${lista(r.conversas, 4, (c) => { const u = c.ultimas[0]; return `${c.lead.nome}${u ? ` (${u.quem}: "${curto(u.texto, 50)}", ${quandoBR(u.quando)})` : ''}`; })}.` + (hum.length ? ` ${plural(hum.length, 'pede', 'pedem')} você.` : '');
    }
    case 'leads': {
      const quentes = r.leads.lista.filter((l) => /quente|hot/i.test(l.temp));
      return `Você tem ${plural(r.leads.total, 'lead', 'leads')}.` + (r.leads.lista.length ? ` Os mais recentes: ${lista(r.leads.lista, 4, (l) => l.nome + (l.fase ? ` (${l.fase})` : ''))}.` : '') + (quentes.length ? ` Quentes: ${lista(quentes, 3, (l) => l.nome)}.` : '');
    }
    case 'clientes': return `Você tem ${plural(r.clientes.total, 'cliente', 'clientes')} cadastrados.` + (r.clientes.lista.length ? ` Os últimos: ${lista(r.clientes.lista, 5, (c) => c.nome)}.` : '');
    case 'contratos': {
      if (!r.contratos.length) return 'Ainda não há contratos.';
      const por = {}; r.contratos.forEach((k) => { por[k.status] = (por[k.status] || 0) + 1; });
      return `São ${plural(r.contratos.length, 'contrato', 'contratos')}: ${Object.entries(por).map(([st, n]) => `${n} ${st.replace(/_/g, ' ')}`).join(', ')}. O mais recente: ${r.contratos[0].titulo}.`;
    }
    case 'produtos': {
      const p = r.produtos.find((x) => t.includes(sem(x.nome)));
      if (p) return `${p.nome} custa ${p.preco ? reais(p.preco) : 'sem preço definido'}${p.parcelas > 1 ? `, em até ${p.parcelas} vezes` : ''}${p.prazo ? `, entrega em ${p.prazo}` : ''}.${p.ativo ? '' : ' Está desligado: o agente não oferece.'}`;
      const at = r.produtos.filter((x) => x.ativo);
      if (!r.produtos.length) return 'Você ainda não cadastrou produtos. Quer abrir a tela de Produtos?';
      return `Você tem ${plural(at.length, 'produto ativo', 'produtos ativos')}: ${lista(at, 5, (x) => `${x.nome} ${x.preco ? reais(x.preco) : 'sem preço'}`)}.`;
    }
    case 'estoque': {
      const i = r.estoque.lista.find((x) => t.includes(sem(x.nome)));
      if (i) return `Tem ${i.qtd} de ${i.nome} no estoque.`;
      if (!r.estoque.itens) return 'O estoque está vazio.';
      return r.estoque.baixo.length ? `Abaixo do mínimo: ${lista(r.estoque.baixo, 5, (x) => `${x.nome} (${x.qtd} de ${x.min})`)}.` : `Tudo abastecido nos ${r.estoque.itens} itens do estoque.`;
    }
    case 'notas': return r.notas.length ? `Suas notas mais recentes: ${lista(r.notas, 4, (n) => n.titulo + (n.lembrete ? ` (lembrete ${quandoBR(n.lembrete)})` : ''))}.` : 'Você não tem notas.';
    case 'campanhas': return r.campanhas.length ? `Campanhas: ${lista(r.campanhas, 5, (c) => `${c.nome} (${c.status})`)}.` : 'Nenhuma campanha criada.';
    case 'rifas': return r.rifas.length ? lista(r.rifas, 3, (x) => `A rifa ${x.titulo} está ${x.status}, com ${x.vendidos} de ${x.total} números vendidos e ${reais(x.arrecadado)} arrecadado${x.pendentes ? `; ${plural(x.pendentes, 'pedido espera', 'pedidos esperam')} pagamento` : ''}`) + '.' : 'Você não tem rifas.';
    case 'consultas': return r.consultas ? `Seu saldo de consultas é ${reais(r.consultas.saldo)}.` : 'Você ainda não tem saldo de consultas.';
    case 'duvidas': return r.duvidas.length ? `O agente não soube responder: ${lista(r.duvidas, 4, (d) => `"${curto(d.pergunta, 70)}" (${d.vezes} vezes)`)}. Ensine as respostas na tela Agente.` : 'O agente respondeu tudo o que perguntaram.';
    case 'agente': return r.agente ? `Seu agente é ${r.agente.nome} e está ${r.agente.ativo ? 'ligado' : 'pausado'}.` : 'Você ainda não criou o seu agente.';
    case 'empresa': return r.empresa ? `${r.empresa.nome || 'Sua empresa'}${r.empresa.cidade ? `, em ${r.empresa.cidade}` : ''}.${r.empresa.whatsapp ? ' WhatsApp ' + r.empresa.whatsapp + '.' : ''}` : 'Os dados da empresa ainda não foram preenchidos.';
    case 'chamados': return r.admin ? (r.admin.chamados.total ? `${plural(r.admin.chamados.total, 'chamado aberto', 'chamados abertos')}: ${lista(r.admin.chamados.lista, 4, (c) => `${c.titulo} (${c.cliente_nome}, prioridade ${c.prioridade})`)}.` : 'Nenhum chamado aberto.') : null;
    case 'tarefas': return r.admin ? (r.admin.tarefas.total ? `${plural(r.admin.tarefas.total, 'tarefa aberta', 'tarefas abertas')}: ${lista(r.admin.tarefas.lista, 4, (x) => x.titulo + (x.responsavel ? ` com ${x.responsavel}` : ''))}.` : 'Nenhuma tarefa aberta no time.') : null;
    case 'plataforma': return r.admin ? `A plataforma tem ${plural(r.admin.tenants, 'cliente', 'clientes')}; ${plural(r.admin.pedidos.total, 'pedido de compra', 'pedidos de compra')} e ${plural(r.admin.saques, 'saque', 'saques')} para aprovar.` : null;
    default: return null;
  }
}

// ---------- IA com ferramentas (Groq) ----------
const CONSULTAS = {
  conversas: (uid, f) => `conversas?tenant_id=eq.${uid}&select=status,channel,titulo,updated_at,leads(name,nome_exibicao,phone)&order=updated_at.desc`,
  mensagens: (uid, f) => `mensagens?select=role,content,created_at,conversas!inner(tenant_id,leads(name))&conversas.tenant_id=eq.${uid}&deleted_at=is.null${f ? `&content=ilike.*${f}*` : ''}&order=created_at.desc`,
  leads: (uid, f) => `leads?tenant_id=eq.${uid}&deleted_at=is.null&select=name,nome_exibicao,phone,email,fase_pipeline,temperatura_lead,origem_lead,valor_conversao,created_at${f ? `&or=(name.ilike.*${f}*,nome_exibicao.ilike.*${f}*,phone.ilike.*${f}*)` : ''}&order=updated_at.desc`,
  clientes: (uid, f) => `clientes?owner_id=eq.${uid}&deleted_at=is.null&select=nome,telefone,email,tags,fonte,criado_em${f ? `&nome=ilike.*${f}*` : ''}&order=atualizado_em.desc`,
  agenda: (uid, f) => `eventos_agenda?tenant_id=eq.${uid}&deleted_at=is.null&select=titulo,descricao,inicio_em,fim_em,status,tipo${f ? `&titulo=ilike.*${f}*` : ''}&order=inicio_em.desc`,
  financeiro: (uid, f) => `contas_a_receber?tenant_id=eq.${uid}&deleted_at=is.null&select=descricao,valor,vencimento,status,recebida_em,numero_parcela,leads(name)${f ? `&descricao=ilike.*${f}*` : ''}&order=vencimento.desc`,
  contratos: (uid, f) => `contratos?tenant_id=eq.${uid}&select=titulo,nome_template,status,created_at,assinado_em,dados_cliente${f ? `&titulo=ilike.*${f}*` : ''}&order=created_at.desc`,
  produtos: (uid, f) => `produtos?user_id=eq.${uid}&select=nome,descricao_curta,preco_centavos,entrada_centavos,max_parcelas,prazo_entrega,garantia,ativo${f ? `&nome=ilike.*${f}*` : ''}&order=ordem.asc`,
  estoque: (uid, f) => `estoque_itens?tenant_id=eq.${uid}&deleted_at=is.null&select=nome,sku,categoria,quantidade,quantidade_minima${f ? `&nome=ilike.*${f}*` : ''}&order=nome.asc`,
  notas: (uid, f) => `notas_app?user_id=eq.${uid}&deleted_at=is.null&select=titulo,conteudo,data_lembrete,updated_at${f ? `&or=(titulo.ilike.*${f}*,conteudo.ilike.*${f}*)` : ''}&order=updated_at.desc`,
  campanhas: (uid, f) => `campanhas?tenant_id=eq.${uid}&deleted_at=is.null&select=name,status,type,objective,starts_at,ends_at${f ? `&name=ilike.*${f}*` : ''}&order=created_at.desc`,
  rifas: (uid, f) => `rifas?tenant_id=eq.${uid}&deleted_at=is.null&select=titulo,status,total_numeros,preco_numero_centavos,premio_principal,data_sorteio_prevista,ganhador_nome${f ? `&titulo=ilike.*${f}*` : ''}&order=created_at.desc`,
  pedidos_rifa: (uid, f) => `pedidos_rifa?tenant_id=eq.${uid}&select=nome,phone,qtd_numeros,numeros,valor_centavos,status,created_at${f ? `&nome=ilike.*${f}*` : ''}&order=created_at.desc`,
  chamados_gestao: (uid, f) => `gestao_chamados?deleted_at=is.null&select=numero,titulo,cliente_nome,prioridade,status,responsavel,aberto_em${f ? `&or=(titulo.ilike.*${f}*,cliente_nome.ilike.*${f}*)` : ''}&order=aberto_em.desc`,
  clientes_gestao: (uid, f) => `gestao_clientes?deleted_at=is.null&select=nome,email,telefone,situacao,setup,mensalidade,implementador,suporte${f ? `&nome=ilike.*${f}*` : ''}&order=nome.asc`,
  tarefas_gestao: (uid, f) => `gestao_tarefas?deleted_at=is.null&select=titulo,responsavel,prazo,prioridade,status,area${f ? `&titulo=ilike.*${f}*` : ''}&order=prazo.asc`,
};
const limpaFiltro = (f) => String(f || '').replace(/[^\p{L}\p{N} @.\-]/gu, ' ').trim().slice(0, 40).replace(/\s+/g, '*');

function ferramentas() {
  return [
    { type: 'function', function: { name: 'abrir_tela', description: 'Abre uma tela do app quando a pessoa pedir para abrir, ir ou mostrar uma tela.', parameters: { type: 'object', properties: { tela: { type: 'string', enum: TELAS.map((x) => x[0]) } }, required: ['tela'] } } },
    { type: 'function', function: { name: 'consultar', description: 'Busca no banco de dados da pessoa (só leitura) quando o retrato não basta: conversas, mensagens (busca por texto), leads, clientes, agenda, financeiro, contratos, produtos, estoque, notas, campanhas, rifas, pedidos_rifa e, para admin, chamados_gestao, clientes_gestao, tarefas_gestao.', parameters: { type: 'object', properties: { tabela: { type: 'string', enum: Object.keys(CONSULTAS) }, filtro: { type: 'string', description: 'texto para procurar (nome, título ou trecho); vazio = os mais recentes' }, limite: { type: 'integer', minimum: 1, maximum: 25 } }, required: ['tabela'] } } },
    { type: 'function', function: { name: 'buscar_web', description: 'Pesquisa na internet o que não está nos dados do app (resumo + Wikipédia).', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } } },
    { type: 'function', function: { name: 'lembrar', description: 'Guarda um fato que a pessoa pediu para lembrar ou que vale lembrar sobre ela.', parameters: { type: 'object', properties: { fato: { type: 'string' } }, required: ['fato'] } } },
  ];
}

async function buscarWeb(q) {
  const out = [];
  try { const r = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&lang=pt-br', { signal: AbortSignal.timeout(8000) }); if (r.ok) { const j = await r.json(); const t = j.AbstractText || j.Answer || (j.RelatedTopics && j.RelatedTopics[0] && j.RelatedTopics[0].Text); if (t) out.push(t); } } catch { /* sem web */ }
  try { const r = await fetch('https://pt.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(q.replace(/\s+/g, '_')), { signal: AbortSignal.timeout(8000) }); if (r.ok) { const j = await r.json(); if (j.extract) out.push('Wikipédia: ' + j.extract); } } catch { /* sem web */ }
  return (out.join('\n').slice(0, 1500)) || `Nada encontrado na web para "${q}".`;
}

async function responderIA(q, r, sb, s, chat) {
  const nav = { tela: null };
  const sistema = `Você é o Mentor da Babel, o braço direito de ${r.eu.nome || 'quem está usando'} no negócio. Fale em português do Brasil, como numa conversa por voz: direto, gentil, no máximo 90 palavras, sem markdown, sem listas com marcadores e sem emojis (a resposta é lida em voz alta).
Use os DADOS abaixo (lidos do banco agora) e, se faltar algo, a ferramenta consultar. Nunca invente número, nome, data ou valor: se não achar, diga que não encontrou. Valores em reais escritos por extenso curto (ex.: R$ 1.250,00). Para abrir uma tela use abrir_tela. Para assuntos fora do negócio, responda com o que você sabe ou use buscar_web.
DADOS:
${r.texto}`;
  const msgs = [{ role: 'system', content: sistema }, ...s.msgs.slice(-8), { role: 'user', content: q }];
  for (let volta = 0; volta < 5; volta++) {
    const m = await chat(msgs, ferramentas());
    const calls = m.tool_calls || [];
    if (!calls.length) return { fala: String(m.content || '').trim() || 'Pronto.', abrir: nav.tela };
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: calls });
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* sem args */ }
      let res = '';
      const nome = c.function.name;
      if (nome === 'abrir_tela') { const tl = TELAS.find((x) => x[0] === args.tela); if (tl) { nav.tela = tl[0]; res = 'Abrindo ' + tl[1] + '.'; } else res = 'Tela desconhecida.'; }
      else if (nome === 'consultar') {
        const fn = CONSULTAS[args.tabela];
        if (!fn || !sb) res = 'consulta indisponível';
        else if (/_gestao$/.test(args.tabela) && !r.eu.admin) res = 'só o admin vê a gestão';
        else { const lim = Math.max(1, Math.min(25, Number(args.limite) || 10)); const linhas = await sb.ler(...(() => { const qs = fn(r.eu.id, limpaFiltro(args.filtro)); const i = qs.indexOf('?'); return [qs.slice(0, i), qs.slice(i + 1) + `&limit=${lim}`]; })()); res = JSON.stringify(linhas).slice(0, 3500) || '[]'; }
      } else if (nome === 'buscar_web') res = await buscarWeb(String(args.q || '').slice(0, 120));
      else if (nome === 'lembrar') { const fato = curto(args.fato, 300); if (fato) { await memoria.lembrar(fato); if (sb) await sb.inserir('memoria_dono', { owner_id: r.eu.id, fato, categoria: 'mentor', ativa: true }); res = 'Guardado.'; } else res = 'Nada para guardar.'; }
      else res = 'ferramenta desconhecida';
      msgs.push({ role: 'tool', tool_call_id: c.id, content: res });
    }
  }
  return { fala: 'Não consegui fechar a resposta agora. Pode perguntar de outro jeito?', abrir: nav.tela };
}

// ---------- entrada ----------
async function perguntar(q, auth, ia) {
  q = String(q || '').trim().slice(0, 600);
  const sb = auth && auth.token ? supa.cliente(auth.token, auth.apikey) : null;
  const eu = sb ? await sb.eu() : null;
  const s = sessao(eu ? eu.id : 'anon');
  const fim = (out) => { s.em = Date.now(); s.msgs.push({ role: 'user', content: q }, { role: 'assistant', content: out.fala }); s.msgs = s.msgs.slice(-12); memoria.registrar({ pergunta: q, fala: out.fala }).catch(() => {}); return out; };

  // memória
  let m = q.match(/lembr[eé](?:-se)?(?:\s+que|\s+de)?\s+(.+)/i) || q.match(/meu nome (?:é|e)\s+(.+)/i) || q.match(/me chame de\s+(.+)/i);
  if (m && !/\?$/.test(q)) {
    const fato = /meu nome|me chame/i.test(q) ? `O nome da pessoa é ${m[1].replace(/[.!]+$/, '')}.` : m[1].replace(/[.!]+$/, '');
    await memoria.lembrar(fato);
    if (sb && eu) await sb.inserir('memoria_dono', { owner_id: eu.id, fato, categoria: 'mentor', ativa: true });
    return fim({ fala: `Anotado: ${fato}`, memoria: true });
  }
  m = q.match(/esque[çc]a\s+(.+)/i);
  if (m) { const n = await memoria.esquecerTexto(m[1]); return fim({ fala: n ? 'Esqueci.' : 'Não achei isso na minha memória.', memoria: true }); }

  // abrir tela (sem gastar IA)
  const t = sem(q);
  if (/\b(abr[ae]|abrir|ir para|vai para|va para|mostr[ae]|me leva|entra em|entrar em)\b/.test(t)) {
    const tl = acharTela(q);
    if (tl) return fim({ fala: `Abrindo ${tl.nome}.`, abrir: tl.id });
  }

  if (!eu) {
    const fs = await memoria.fatos();
    return fim({ fala: 'Para eu ver os seus dados, preciso que você esteja com o login feito no app. Recarregue a página e entre de novo.' + (fs.length ? '' : ''), local: true });
  }
  const r = await retrato(sb, eu, auth.token, { fresco: /atualiz|de novo|agora mesmo/.test(t) });

  if (ia && ia.temChave()) {
    try { return fim(await responderIA(q, r, sb, s, ia.chat)); }
    catch (e) { console.error('ia:', String(e.message || e).slice(0, 200)); }
  }
  const local = responderLocal(q, r, s);
  if (local) return fim({ fala: local, local: true });
  return fim({ fala: 'Essa eu ainda não sei responder: a inteligência artificial do Mentor está desligada (falta a chave do OpenRouter no cérebro). Sobre os seus dados eu já respondo: o que pede você, quanto entrou, quem está atrasado, agenda, conversas, leads, clientes, produtos, estoque, contratos, rifas e campanhas.', local: true });
}

module.exports = { perguntar, responderLocal, intencao };

// Cérebro Babel — retrato do negócio de quem pergunta, lido do banco com o login dele.
// Junta o que o Mentor precisa para responder: conversas, clientes, agenda, dinheiro, contratos, produtos,
// estoque, notas, campanhas, rifas, consultas, dúvidas do agente, memórias e (admin) a plataforma.
'use strict';

const CACHE = new Map(); // token → { em, r }
const VALIDADE = 30 * 1000;

const reais = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const diaBR = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}` : '—'; };
const horaBR = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const quandoBR = (iso) => { const d = new Date(iso); if (isNaN(d)) return '—'; const h = new Date(); const dif = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 864e5);
  return (dif === 0 ? 'hoje' : dif === -1 ? 'ontem' : dif === 1 ? 'amanhã' : `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`) + ' ' + horaBR(iso); };
const nomeLead = (l) => (l && (l.nome_exibicao || l.name)) || 'contato sem nome';
const curto = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

async function montar(sb, eu) {
  const uid = eu.id;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const h0 = ymd(hoje);
  const desde = new Date(hoje); desde.setDate(desde.getDate() - 1);
  const ate = new Date(hoje); ate.setDate(ate.getDate() + 15);

  const [perfil, empresa, agente, conv, leads, clientes, agenda, fin, contratos, produtos, estoque, notas, campanhas, rifas, pedRifa, saldo, duvidas, memorias] = await Promise.all([
    sb.ler('profiles', `id=eq.${uid}&select=full_name,apelido,system_role,email`),
    sb.ler('empresas', `user_id=eq.${uid}&select=nome,cidade,estado,descricao,horario_funcionamento,whatsapp,instagram,site&limit=1`),
    sb.ler('agentes', `user_id=eq.${uid}&select=nome_agente,is_active,tom_agente&order=created_at.asc&limit=1`),
    sb.ler('conversas', `tenant_id=eq.${uid}&channel=neq.teste&select=id,status,channel,titulo,updated_at,agent_enabled,leads(name,nome_exibicao,phone,precisa_humano,temperatura_lead)&order=updated_at.desc&limit=40`),
    sb.ler('leads', `tenant_id=eq.${uid}&deleted_at=is.null&select=id,name,nome_exibicao,phone,fase_pipeline,temperatura_lead,precisa_humano,valor_conversao,updated_at&order=updated_at.desc&limit=60`, { contar: true }),
    sb.ler('clientes', `owner_id=eq.${uid}&deleted_at=is.null&select=nome,telefone,email,tags,criado_em&order=atualizado_em.desc&limit=60`, { contar: true }),
    sb.ler('eventos_agenda', `tenant_id=eq.${uid}&deleted_at=is.null&inicio_em=gte.${desde.toISOString()}&inicio_em=lte.${ate.toISOString()}&select=titulo,descricao,inicio_em,fim_em,status,tipo&order=inicio_em.asc&limit=60`),
    sb.ler('contas_a_receber', `tenant_id=eq.${uid}&deleted_at=is.null&select=descricao,valor,vencimento,status,recebida_em,numero_parcela,lead_id&order=vencimento.asc&limit=400`),
    sb.ler('contratos', `tenant_id=eq.${uid}&select=titulo,nome_template,status,created_at,assinado_em&order=created_at.desc&limit=30`),
    sb.ler('produtos', `user_id=eq.${uid}&select=nome,preco_centavos,ativo,max_parcelas,prazo_entrega,descricao_curta&order=ordem.asc&limit=80`),
    sb.ler('estoque_itens', `tenant_id=eq.${uid}&deleted_at=is.null&select=nome,quantidade,quantidade_minima,categoria&order=nome.asc&limit=300`),
    sb.ler('notas_app', `user_id=eq.${uid}&deleted_at=is.null&select=titulo,conteudo,data_lembrete,cravada,updated_at&order=updated_at.desc&limit=20`),
    sb.ler('campanhas', `tenant_id=eq.${uid}&deleted_at=is.null&select=name,status,type,starts_at,ends_at&order=created_at.desc&limit=20`),
    sb.ler('rifas', `tenant_id=eq.${uid}&deleted_at=is.null&select=id,titulo,status,total_numeros,preco_numero_centavos,data_sorteio_prevista,ganhador_nome&order=created_at.desc&limit=10`),
    sb.ler('pedidos_rifa', `tenant_id=eq.${uid}&select=rifa_id,status,valor_centavos,qtd_numeros&limit=2000`),
    sb.ler('consultas_saldo', `tenant_id=eq.${uid}&select=saldo`),
    sb.ler('perguntas_sem_resposta', `tenant_id=eq.${uid}&resolvido=eq.false&select=pergunta,ocorrencias&order=ocorrencias.desc&limit=10`),
    sb.ler('memoria_dono', `owner_id=eq.${uid}&ativa=eq.true&select=fato&order=atualizado_em.desc&limit=30`),
  ]);

  // últimas mensagens das conversas
  const ids = conv.map((c) => c.id);
  const msgs = ids.length ? await sb.ler('mensagens', `conversation_id=in.(${ids.join(',')})&deleted_at=is.null&select=conversation_id,role,content,created_at&order=created_at.desc&limit=400`) : [];
  const porConv = {};
  for (const m of msgs) { const l = (porConv[m.conversation_id] ||= []); if (l.length < 4) l.push(m); }

  // nomes dos contatos das cobranças
  const leadIds = [...new Set(fin.map((f) => f.lead_id).filter(Boolean))].filter((id) => !leads.linhas.some((l) => l.id === id));
  const extras = leadIds.length ? await sb.ler('leads', `id=in.(${leadIds.slice(0, 80).join(',')})&select=id,name,nome_exibicao`) : [];
  const leadNome = new Map([...leads.linhas, ...extras].map((l) => [l.id, nomeLead(l)]));

  const me = perfil[0] || {};
  const admin = me.system_role === 'platform_admin';
  const r = {
    eu: { id: uid, email: eu.email, nome: me.apelido || me.full_name || '', papel: me.system_role || 'user', admin },
    hoje: hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
    empresa: empresa[0] || null,
    agente: agente[0] ? { nome: agente[0].nome_agente || 'sem nome', ativo: agente[0].is_active !== false, tom: agente[0].tom_agente || '' } : null,
    conversas: conv.map((c) => ({ canal: c.channel || '', status: c.status || '', titulo: c.titulo || '', quando: c.updated_at, ia: c.agent_enabled !== false,
      lead: c.leads ? { nome: nomeLead(c.leads), humano: !!c.leads.precisa_humano, temp: c.leads.temperatura_lead || '' } : { nome: 'contato', humano: false, temp: '' },
      ultimas: (porConv[c.id] || []).map((m) => ({ quem: m.role === 'user' ? 'cliente' : m.role === 'human' ? 'você' : 'agente', texto: curto(m.content, 160), quando: m.created_at })) })),
    leads: { total: leads.total, lista: leads.linhas.map((l) => ({ nome: nomeLead(l), fase: l.fase_pipeline || '', temp: l.temperatura_lead || '', humano: !!l.precisa_humano, valor: Number(l.valor_conversao) || 0 })) },
    clientes: { total: clientes.total, lista: clientes.linhas.map((c) => ({ nome: c.nome, telefone: c.telefone || '', email: c.email || '', desde: c.criado_em })) },
    agenda: agenda.map((e) => ({ titulo: e.titulo, inicio: e.inicio_em, fim: e.fim_em, status: e.status || '', tipo: e.tipo || '', obs: curto(e.descricao, 120) })),
    contratos: contratos.map((k) => ({ titulo: k.titulo || k.nome_template || 'contrato', status: k.status || '', criado: k.created_at, assinado: k.assinado_em })),
    produtos: produtos.map((p) => ({ nome: p.nome, preco: (Number(p.preco_centavos) || 0) / 100, ativo: p.ativo !== false, parcelas: p.max_parcelas || 1, prazo: p.prazo_entrega || '', desc: curto(p.descricao_curta, 120) })),
    estoque: { itens: estoque.length, baixo: estoque.filter((i) => Number(i.quantidade_minima) > 0 && Number(i.quantidade) <= Number(i.quantidade_minima)).map((i) => ({ nome: i.nome, qtd: Number(i.quantidade) || 0, min: Number(i.quantidade_minima) || 0 })), lista: estoque.map((i) => ({ nome: i.nome, qtd: Number(i.quantidade) || 0 })) },
    notas: notas.map((n) => ({ titulo: n.titulo || curto(n.conteudo, 40) || 'nota', lembrete: n.data_lembrete || null, cravada: !!n.cravada, texto: curto(n.conteudo, 200) })),
    campanhas: campanhas.map((c) => ({ nome: c.name, status: c.status || '', tipo: c.type || '' })),
    rifas: rifas.map((x) => { const p = pedRifa.filter((q) => q.rifa_id === x.id); const pagos = p.filter((q) => q.status === 'pago');
      return { titulo: x.titulo, status: x.status || '', total: x.total_numeros || 0, preco: (Number(x.preco_numero_centavos) || 0) / 100, vendidos: pagos.reduce((a, q) => a + (Number(q.qtd_numeros) || 0), 0), arrecadado: pagos.reduce((a, q) => a + (Number(q.valor_centavos) || 0), 0) / 100, pendentes: p.filter((q) => q.status === 'reservado' || q.status === 'aguardando_validacao').length, sorteio: x.data_sorteio_prevista, ganhador: x.ganhador_nome || '' }; }),
    consultas: saldo[0] ? { saldo: Number(saldo[0].saldo) || 0 } : null,
    duvidas: duvidas.map((d) => ({ pergunta: d.pergunta, vezes: d.ocorrencias || 1 })),
    memorias: memorias.map((m) => m.fato),
  };

  // dinheiro
  const aberto = (f) => f.status !== 'recebida' && f.status !== 'paga' && f.status !== 'cancelada';
  const item = (f) => ({ desc: f.descricao || ('parcela ' + (f.numero_parcela || '')), valor: Number(f.valor) || 0, venc: f.vencimento, quem: leadNome.get(f.lead_id) || '', em: f.recebida_em });
  const rec = fin.filter((f) => !aberto(f) && f.recebida_em);
  const diasAtras = (n) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return d; };
  const soma = (l) => l.reduce((a, f) => a + (Number(f.valor) || 0), 0);
  const recDesde = (d) => rec.filter((f) => new Date(f.recebida_em) >= d);
  const ontem = diasAtras(1);
  r.fin = {
    aReceber: soma(fin.filter(aberto)),
    vencidas: fin.filter((f) => aberto(f) && f.vencimento && f.vencimento < h0).map(item),
    hoje: fin.filter((f) => aberto(f) && f.vencimento === h0).map(item),
    proximas: fin.filter((f) => aberto(f) && f.vencimento && f.vencimento > h0).slice(0, 12).map(item),
    recebidas: rec.slice().sort((a, b) => String(b.recebida_em).localeCompare(String(a.recebida_em))).slice(0, 12).map(item),
    recebidoHoje: soma(recDesde(hoje)),
    recebidoOntem: soma(rec.filter((f) => { const d = new Date(f.recebida_em); return d >= ontem && d < hoje; })),
    recebido7: soma(recDesde(diasAtras(7))),
    recebido30: soma(recDesde(diasAtras(30))),
    recebidoMes: soma(recDesde(new Date(hoje.getFullYear(), hoje.getMonth(), 1))),
  };

  // plataforma (só admin)
  if (admin) {
    const [ten, ped, saq, recg, cham, impl, tar] = await Promise.all([
      sb.ler('profiles', 'parent_user_id=is.null&system_role=neq.platform_admin&deleted_at=is.null&select=id', { contar: true }),
      sb.ler('pedidos_compra', 'status=eq.pendente&select=item_nome,item_preco', { contar: true }),
      sb.ler('multinivel_saques', 'status=eq.pendente&select=valor', { contar: true }),
      sb.ler('consultas_recargas', 'status=in.(aguardando,comprovante_enviado)&select=id', { contar: true }),
      sb.ler('gestao_chamados', 'deleted_at=is.null&status=in.(aberto,andamento,aguardando_cliente,aguardando_equipe)&select=numero,titulo,cliente_nome,prioridade,status&order=aberto_em.asc&limit=20', { contar: true }),
      sb.ler('gestao_implementacoes', 'deleted_at=is.null&status=neq.concluida&select=cliente_nome,status', { contar: true }),
      sb.ler('gestao_tarefas', 'deleted_at=is.null&status=neq.concluida&select=titulo,responsavel,prazo,status&order=prazo.asc&limit=20', { contar: true }),
    ]);
    r.admin = { tenants: ten.total, pedidos: { total: ped.total, lista: ped.linhas.slice(0, 10) }, saques: saq.total, recargas: recg.total,
      chamados: { total: cham.total, lista: cham.linhas }, implantacoes: { total: impl.total, lista: impl.linhas.slice(0, 15) }, tarefas: { total: tar.total, lista: tar.linhas } };
  }
  r.texto = texto(r);
  return r;
}

// o retrato em linhas curtas, para a IA
function texto(r) {
  const L = [];
  L.push(`Hoje é ${r.hoje}. Quem pergunta: ${r.eu.nome || r.eu.email}${r.eu.admin ? ' (administrador da plataforma)' : ''}.`);
  if (r.empresa) L.push(`Empresa: ${r.empresa.nome || '—'}${r.empresa.cidade ? ' · ' + r.empresa.cidade + '/' + (r.empresa.estado || '') : ''}${r.empresa.horario_funcionamento ? ' · horário: ' + curto(JSON.stringify(r.empresa.horario_funcionamento), 120) : ''}.`);
  if (r.agente) L.push(`Agente: ${r.agente.nome} (${r.agente.ativo ? 'ligado' : 'pausado'}${r.agente.tom ? ', tom ' + r.agente.tom : ''}).`);
  const f = r.fin;
  L.push(`Dinheiro: recebido hoje ${reais(f.recebidoHoje)}, ontem ${reais(f.recebidoOntem)}, 7 dias ${reais(f.recebido7)}, 30 dias ${reais(f.recebido30)}, no mês ${reais(f.recebidoMes)}; a receber ${reais(f.aReceber)}.`);
  if (f.vencidas.length) L.push(`Atrasadas (${f.vencidas.length}): ` + f.vencidas.slice(0, 10).map((x) => `${x.quem || x.desc} ${reais(x.valor)} venceu ${diaBR(x.venc)}`).join(' | '));
  if (f.hoje.length) L.push(`Vencem hoje (${f.hoje.length}): ` + f.hoje.map((x) => `${x.quem || x.desc} ${reais(x.valor)}`).join(' | '));
  if (f.proximas.length) L.push('Próximas a receber: ' + f.proximas.slice(0, 8).map((x) => `${x.quem || x.desc} ${reais(x.valor)} em ${diaBR(x.venc)}`).join(' | '));
  if (f.recebidas.length) L.push('Últimos recebimentos: ' + f.recebidas.slice(0, 6).map((x) => `${x.quem || x.desc} ${reais(x.valor)} ${quandoBR(x.em)}`).join(' | '));
  const ag = r.agenda.filter((e) => new Date(e.inicio) >= new Date(new Date().setHours(0, 0, 0, 0)));
  L.push(`Agenda (${ag.length} nos próximos 15 dias): ` + (ag.slice(0, 12).map((e) => `${quandoBR(e.inicio)} ${e.titulo}${e.status && e.status !== 'pendente' ? ' [' + e.status + ']' : ''}`).join(' | ') || 'livre'));
  L.push(`Conversas recentes (${r.conversas.length}): ` + r.conversas.slice(0, 12).map((c) => {
    const u = c.ultimas[0]; return `${c.lead.nome} (${c.canal}${c.lead.humano ? ', pede você' : ''})${u ? ': "' + curto(u.texto, 70) + '" ' + quandoBR(u.quando) : ''}`; }).join(' | '));
  const hum = r.conversas.filter((c) => c.lead.humano);
  if (hum.length) L.push('Pedem você: ' + hum.map((c) => c.lead.nome).join(', '));
  L.push(`Leads: ${r.leads.total}${r.leads.lista.length ? ' · recentes: ' + r.leads.lista.slice(0, 10).map((l) => `${l.nome}${l.fase ? ' (' + l.fase + ')' : ''}${l.temp ? ' ' + l.temp : ''}`).join(', ') : ''}.`);
  L.push(`Clientes: ${r.clientes.total}${r.clientes.lista.length ? ' · ' + r.clientes.lista.slice(0, 15).map((c) => c.nome).join(', ') : ''}.`);
  if (r.contratos.length) L.push('Contratos: ' + r.contratos.slice(0, 10).map((k) => `${k.titulo} [${k.status}]`).join(' | '));
  if (r.produtos.length) L.push('Produtos: ' + r.produtos.slice(0, 20).map((p) => `${p.nome} ${p.preco ? reais(p.preco) : 'sem preço'}${p.parcelas > 1 ? ' até ' + p.parcelas + 'x' : ''}${p.ativo ? '' : ' (desligado)'}`).join(' | '));
  if (r.estoque.itens) L.push(`Estoque: ${r.estoque.itens} itens${r.estoque.baixo.length ? '; abaixo do mínimo: ' + r.estoque.baixo.map((i) => `${i.nome} (${i.qtd}/${i.min})`).join(', ') : ''}.`);
  if (r.notas.length) L.push('Notas: ' + r.notas.slice(0, 8).map((n) => `${n.titulo}${n.lembrete ? ' (lembrete ' + quandoBR(n.lembrete) + ')' : ''}`).join(' | '));
  if (r.campanhas.length) L.push('Campanhas: ' + r.campanhas.map((c) => `${c.nome} [${c.status}]`).join(' | '));
  if (r.rifas.length) L.push('Rifas: ' + r.rifas.map((x) => `${x.titulo} [${x.status}] ${x.vendidos}/${x.total} números, ${reais(x.arrecadado)} arrecadado${x.pendentes ? ', ' + x.pendentes + ' pedidos esperando pagamento' : ''}`).join(' | '));
  if (r.consultas) L.push(`Saldo de consultas: ${reais(r.consultas.saldo)}.`);
  if (r.duvidas.length) L.push('Perguntas que o agente não soube responder: ' + r.duvidas.map((d) => `"${curto(d.pergunta, 80)}" (${d.vezes}x)`).join(' | '));
  if (r.memorias.length) L.push('O que você já me contou: ' + r.memorias.slice(0, 15).join(' | '));
  if (r.admin) {
    const A = r.admin;
    L.push(`Plataforma: ${A.tenants} clientes da Babel; pedidos de compra pendentes ${A.pedidos.total}; saques pendentes ${A.saques}; recargas de consulta esperando ${A.recargas}.`);
    if (A.chamados.total) L.push(`Chamados abertos (${A.chamados.total}): ` + A.chamados.lista.map((c) => `CH-${String(c.numero).padStart(4, '0')} ${c.titulo} (${c.cliente_nome}, ${c.prioridade}, ${c.status})`).join(' | '));
    if (A.implantacoes.total) L.push(`Implementações em aberto: ${A.implantacoes.total}.`);
    if (A.tarefas.total) L.push(`Tarefas do time abertas (${A.tarefas.total}): ` + A.tarefas.lista.slice(0, 10).map((t) => `${t.titulo}${t.responsavel ? ' — ' + t.responsavel : ''}${t.prazo ? ' até ' + diaBR(t.prazo) : ''}`).join(' | '));
  }
  return L.join('\n').slice(0, 9000);
}

async function retrato(sb, eu, token, { fresco = false } = {}) {
  const c = CACHE.get(token);
  if (!fresco && c && Date.now() - c.em < VALIDADE) return c.r;
  const f0 = sb.estado ? sb.estado.falhas : 0;
  const r = await montar(sb, eu);
  const falhou = sb.estado && sb.estado.falhas > f0;
  CACHE.set(token, { em: falhou ? Date.now() - VALIDADE + 5000 : Date.now(), r }); // retrato com falha vale só 5 s
  if (CACHE.size > 50) CACHE.delete(CACHE.keys().next().value);
  return r;
}

module.exports = { retrato, reais, diaBR, quandoBR, horaBR, curto };

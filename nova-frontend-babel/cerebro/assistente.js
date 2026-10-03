// Cérebro Babel — assistente local sobre os dados mocados do app.
// ouvir: áudio → texto (Groq Whisper, precisa de GROQ_API_KEY).
// perguntar: texto → resposta (Groq gpt-oss com os dados; sem chave, responde local).
// voz: texto → mp3 (repassa ao servidor Edge :3100, receita Jarvis).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const D = require('./dados');
const memoria = require('./memoria');

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

const MODELO = process.env.BABEL_MODELO || 'anthropic/claude-3.5-sonnet';
const WHISPER = process.env.BABEL_WHISPER || 'whisper-large-v3-turbo';
const OPENROUTER_BASE = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const EDGE_URL = (process.env.BABEL_EDGE_URL || 'http://localhost:3100').replace(/\/+$/, '');
const JARVIS = { voice: 'pt-BR-AntonioNeural', rate: '-4%', pitch: '-6Hz' };
const VOZES_OK = new Set(['pt-BR-FranciscaNeural', 'pt-BR-ThalitaMultilingualNeural', 'pt-BR-AntonioNeural']);

// ---------- formatos ----------
const brl = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hh = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + (h % 1 ? '30' : '00');
const num = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;
const hojeStr = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

// ---------- leitores dos mocks ----------
function luzes() { return D.LIGHTS; }
function pedeVoce() { return D.LIGHTS.filter((l) => l.tok === 'ciano'); }
function conversas() { return D.CONVS; }
function clientes() { return D.CLIENTES; }
function sumidos() { return D.CLIENTES.filter((c) => c[6] === 'cade'); }
function caixa30() { return D.FITA.reduce((a, b) => a + b, 0); }
function baixas() { return D.BAIXAS; }
function agendaHoje() { return D.EVENTS.filter((e) => (e.day || 0) === 0).sort((a, b) => a.h - b.h); }
function atrasados() { return D.LATE; }
function loja() { return D.PRODS; }
function lojaIncompleta() { return D.PRODS.filter((p) => p[2] && !p[2].startsWith('sob')); }
function equipe() { return D.TEAM; }
function cobrancas() { return D.COBR; }
function cobrancasHoje() { return D.COBR.filter((c) => c.due === 'hoje'); }
function contratos() { return D.CONTRACTS; }
function duvidas() { return D.DUVIDAS; }
function regras() { return D.RULES; }

function listaDados(nome) {
  const L = {
    luzes: () => luzes().map((l) => `${l.area} · ${l.who}: ${l.what} (${l.why})`),
    conversas: () => conversas().map((c) => `${c.who} · ${c.sub} · ${c.canal}`),
    clientes: () => clientes().map((c) => c.join(' · ')),
    financeiro: () => [`Entradas 30 dias: ${brl(caixa30())}`, ...baixas().map((b) => b.join(' · '))],
    agenda: () => [...agendaHoje().map((e) => `${hh(e.h)} · ${e.t} (${e.s})`), ...atrasados().map((e) => `passou do horário: ${e.t} (${e.s})`)],
    loja: () => loja().map((p) => p[0] + ' · ' + p[1] + (p[2] ? ' · ' + p[2] : '')),
    equipe: () => equipe().map((x) => x.join(' · ')),
    cobrancas: () => cobrancas().map((c) => `${c.who} · ${c.what} · ${brl(c.val)} · ${c.st}`),
    contratos: () => contratos().map((k) => `${k.who} · ${k.st} · ${brl(k.val)}`),
    regras: () => regras().map((r) => r.join(' · ')),
  }[nome];
  if (!L) return null;
  const linhas = L();
  return { lista: nome, total: linhas.length, linhas };
}

function retrato() {
  const pede = pedeVoce();
  const tot = caixa30();
  const mel = D.FITA.indexOf(Math.max(...D.FITA));
  const cad = sumidos();
  const inc = lojaIncompleta();
  const cobH = cobrancasHoje();
  const out = [
    `Hoje: ${hojeStr()}.`,
    `Pede você (${pede.length}): ` + (pede.map((l) => `${l.who}: ${l.what}`).join(' | ') || 'nada'),
    `Conversas: ` + conversas().map((c) => `${c.who} (${c.sub})`).join(' | '),
    `Clientes (${clientes().length}, ${cad.length} sumiram): ` + clientes().map((c) => `${c[0]} ${c[3]}`).join(' | '),
    `Caixa 30 dias: ${brl(tot)}; melhor dia ${mel + 1}/set (${brl(D.FITA[mel])}); baixas: ` + baixas().map((b) => `${b[1]} ${b[2]}`).join(' | '),
    `Vendas: ${D.VENDAS.n} fechadas (${brl(D.VENDAS.total)}); mês: ${D.VENDAS.mes} (${brl(D.VENDAS.mesTotal)}).`,
    `Cobranças vencendo hoje (${cobH.length}): ` + (cobH.map((c) => `${c.who} ${brl(c.val)}`).join(' | ') || 'nenhuma'),
    `Agenda hoje: ` + (agendaHoje().map((e) => `${hh(e.h)} ${e.t}`).join(' | ') || 'livre') + (atrasados().length ? `; passaram do horário: ${atrasados().map((e) => e.t).join(' | ')}` : ''),
    `Loja: ${loja().length} peças; ficha incompleta: ` + (inc.map((p) => `${p[0]} (${p[2]})`).join(' | ') || 'nenhuma'),
    `Equipe: ` + equipe().map((x) => `${x[1]} (${x[2]})`).join(' | '),
    `Regras: ` + regras().slice(0, 4).map((r) => r[0]).join(' | '),
    `Dúvidas que ela não soube: ` + duvidas().map((x) => `${x[1]} (${x[0]})`).join(' | '),
  ];
  return out.join('\n').slice(0, 4500);
}

// ---------- chave do OpenRouter (só no servidor) ----------
function openrouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  try {
    const m = /^\s*export\s+OPENROUTER_API_KEY=["']?([^"'\s]+)/m.exec(fs.readFileSync(path.join(os.homedir(), '.bashrc'), 'utf8'));
    if (m) return m[1];
  } catch { /* sem .bashrc */ }
  return null;
}

async function openrouter(p, init) {
  const key = openrouterKey();
  if (!key) throw new HttpError(503, 'sem OPENROUTER_API_KEY');
  let r;
  try {
    r = await fetch(OPENROUTER_BASE + p, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'http://localhost:3078',
        'X-Title': 'Babel Mentor',
        ...init.headers,
      },
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) { throw new HttpError(502, `OpenRouter fora do ar: ${e.message}`); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `OpenRouter ${r.status}: ${String(body.error?.message || '').slice(0, 200)}`);
  return body;
}

// ---------- ouvir ----------
const STT_LOCAL = (process.env.BABEL_STT_URL || 'http://127.0.0.1:3079').replace(/\/+$/, '');
const limpaTexto = (t) => String(t || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
// áudio que não é WAV (m4a/aac/caf do iPhone antigo) vira WAV 16 kHz com o afconvert do macOS
async function paraWav(audio, mime) {
  if (/wav/.test(mime)) return audio;
  if (!/mp4|m4a|aac|caf|mpeg|mp3/.test(mime)) throw new HttpError(415, 'formato de áudio sem conversão local (' + (mime || '?') + ')');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'babel-stt-'));
  const ent = path.join(dir, 'fala.' + (/mpeg|mp3/.test(mime) ? 'mp3' : 'm4a')), sai = path.join(dir, 'fala.wav');
  try {
    fs.writeFileSync(ent, audio);
    await new Promise((ok, ko) => require('node:child_process').execFile('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', ent, sai], { timeout: 20000 }, (e) => (e ? ko(e) : ok())));
    return fs.readFileSync(sai);
  } catch (e) { throw new HttpError(415, 'não consegui converter o áudio: ' + e.message); }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } }
}
async function ouvirLocal(audio, mime) {
  const wav = await paraWav(audio, mime);
  const fd = new FormData();
  fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'fala.wav');
  fd.append('temperature', '0');
  fd.append('response_format', 'json');
  fd.append('language', 'pt');
  let r;
  try { r = await fetch(STT_LOCAL + '/inference', { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) }); }
  catch (e) { throw new HttpError(503, 'ouvido local fora do ar (whisper na porta 3079) · ligue pelo iniciar-babel'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, 'whisper local ' + r.status + ': ' + String(j.error || '').slice(0, 120));
  return { texto: limpaTexto(j.text), fonte: 'local' };
}
async function sttLocalOk() { try { const r = await fetch(STT_LOCAL + '/', { signal: AbortSignal.timeout(1500) }); return r.status < 500; } catch { return false; } }

async function ouvir(audio, mime) {
  if (!audio.length) throw new HttpError(400, 'áudio vazio');
  if (!openrouterKey()) return ouvirLocal(audio, mime);
  const ext = /ogg/.test(mime) ? 'ogg' : /mp4|m4a/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : /mpeg|mp3/.test(mime) ? 'mp3' : 'webm';
  const fd = new FormData();
  fd.append('file', new Blob([audio], { type: mime || 'audio/webm' }), `fala.${ext}`);
  fd.append('model', WHISPER);
  fd.append('language', 'pt');
  fd.append('temperature', '0');
  fd.append('prompt', 'Babel, pede você, cobranças, agenda, loja, quanto entrou, clientes.');
  try {
    const d = await openrouter('/audio/transcriptions', { method: 'POST', body: fd, headers: {} });
    return { texto: limpaTexto(d.text), fonte: 'groq' };
  } catch (e) { if (await sttLocalOk()) return ouvirLocal(audio, mime); throw e; }
}

// ---------- perguntar ----------
const TELAS = D.NAV.map((n) => n[0]);

function acharTela(q) {
  const t = q.toLowerCase();
  const hit = D.NAV.find((n) => t.includes(n[1].toLowerCase()) || t.includes(n[0]));
  return hit ? hit[0] : null;
}

async function perguntar(q, auth) {
  q = String(q || '').trim().slice(0, 600);
  if (!q) throw new HttpError(400, 'pergunta vazia');
  const ia = {
    temChave: () => !!openrouterKey(),
    chat: async (messages, tools) => {
      const d = await openrouter('/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELO, temperature: 0.3, max_completion_tokens: 700, messages, tools, tool_choice: 'auto' }) });
      const m = d.choices && d.choices[0] && d.choices[0].message;
      if (!m) throw new Error('resposta vazia');
      return m;
    },
  };
  return require('./mentor').perguntar(q, auth, ia);
}

async function decidir(q) {
  const t = q.toLowerCase();
  // memória e telas: resolvidos aqui, sem gastar a Groq
  let m = q.match(/lembr[eé](?:\s+que|\s+de)?\s+(.+)/i) || q.match(/meu nome é\s+(.+)/i) || q.match(/me chame de\s+(.+)/i);
  if (m) {
    const fato = /meu nome é|me chame/i.test(q) ? `O nome dele é ${m[1].replace(/[.]+$/, '')}.` : m[1];
    await memoria.lembrar(fato);
    return { fala: `Anotei: ${fato}`, memoria: true };
  }
  m = q.match(/esque[çc]a\s+(.+)/i);
  if (m) {
    const n = await memoria.esquecerTexto(m[1]);
    return { fala: n ? 'Esqueci.' : 'Não achei isso na memória.', memoria: true };
  }
  if (/o que (você|voce) sabe de mim|sabe sobre mim|minha memória|minha memoria/i.test(t)) {
    const fs = await memoria.fatos();
    return { fala: fs.length ? 'O que sei de você: ' + fs.map((f) => f.fato).join(' ') : 'Ainda não sei nada sobre você. Me conta seu nome?', memoria: true };
  }
  if (/abr[ae]|abrir|ir para|mostr|vai para|tela/i.test(t)) {
    const tela = acharTela(q);
    if (tela) { const nv = D.NAV.find((n) => n[0] === tela); return { fala: `Abrindo ${nv[1]}.`, abrir: tela }; }
  }
  if (openrouterKey()) {
    try { return await decidirComLLM(q); }
    catch (e) {
      if (/OpenRouter 429/.test(e.message)) console.error(e.message.slice(0, 120));
      else console.error('openrouter:', e.message.slice(0, 160));
    }
  }
  return responderLocal(q);
}

async function decidirComLLM(q) {
  const lembrancas = await memoria.contexto();
  const d = await openrouter('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO, temperature: 0.2, max_completion_tokens: 600, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `Você é a Babel, assistente local da agência. Responda em português do Brasil, curto (até 120 palavras). Só afirme o que está nos DADOS abaixo — nunca invente números ou nomes. Se pedirem para abrir uma tela, responda SÓ com JSON {"fala":"...","abrir":"id"} com id em [${TELAS.join(', ')}]; senão, {"fala":"..."}. Para lembrar/esquecer, a memória já foi tratada: só confirme.\n\nDADOS:\n${retrato()}${lembrancas ? `\n\n${lembrancas}` : ''}` },
        { role: 'user', content: q },
      ],
    }),
  });
  let a;
  try { a = JSON.parse(d.choices[0].message.content); }
  catch { return responderLocal(q); }
  const out = { fala: String(a.fala || '').slice(0, 800) || 'Pronto.' };
  if (a.abrir && TELAS.includes(a.abrir)) out.abrir = a.abrir;
  return out;
}

// sem chave: responde com os próprios mocks
function responderLocal(q) {
  const t = q.toLowerCase();
  const R = (fala, abrir) => (abrir ? { fala, abrir, local: true } : { fala, local: true });
  const pede = pedeVoce();
  if (/pede|luz|aces|pendente|precisa de mim|tarefa/i.test(t)) {
    if (!pede.length) return R('Nada pede você. Tudo tranquilo por aqui.');
    return R(`${pede.length} ${pede.length === 1 ? 'luz pede' : 'luzes pedem'} você: ` + pede.map((l) => `${l.who}: ${l.what}`).join('. ') + '.', 'inicio');
  }
  if (/entrou|caixa|dinheiro|receb|vend|faturou|faturamento|mês|mes\b/i.test(t)) {
    const tot = caixa30();
    return R(`Nos últimos 30 dias entraram ${brl(tot)}. ${D.VENDAS.n} vendas fechadas somando ${brl(D.VENDAS.total)}; neste mês, ${D.VENDAS.mes} vendas (${brl(D.VENDAS.mesTotal)}). Última: ${D.VENDAS.ult.who}, ${brl(D.VENDAS.ult.val)}.`, 'financeiro');
  }
  if (/cobr|vence|parcela/i.test(t)) {
    const h = cobrancasHoje();
    if (!h.length) return R('Nenhuma cobrança vence hoje.', 'financeiro');
    return R(`${h.length} cobranças vencem hoje, somando ${brl(h.reduce((a, c) => a + c.val, 0))}: ` + h.map((c) => `${c.who} (${brl(c.val)})`).join('. ') + '.', 'financeiro');
  }
  if (/que horas|hora são|hora sao/i.test(t)) {
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const ag = agendaHoje();
    return R(`Agora são ${now}.` + (ag.length ? ` Próximo compromisso: ${ag[0].t} às ${hh(ag[0].h)}.` : ' Agenda de hoje livre.'), ag.length ? 'agenda' : undefined);
  }
  if (/agenda|hoje|compromiss|horário|horario/i.test(t)) {
    const ag = agendaHoje();
    const base = ag.length ? `${ag.length} compromissos hoje: ` + ag.map((e) => `${e.t} às ${hh(e.h)}`).join('. ') + '.' : 'Nada na agenda de hoje.';
    const late = atrasados();
    return R(base + (late.length ? ` Passaram do horário: ${late.map((e) => e.t).join('. ')}.` : ''), 'agenda');
  }
  if (/marcar|agendar|prova|reuni/i.test(t)) return R('Posso sugerir horários: a agenda de hoje tem ' + (agendaHoje().length || 'nenhum') + ' compromisso(s). Abra a agenda e escolha o horário.', 'agenda');
  if (/sumiu|cadê|cade|inativ|parou de comprar/i.test(t)) {
    const cad = sumidos();
    if (!cad.length) return R('Ninguém sumiu: todos os clientes estão ativos.', 'clientes');
    const top = cad.slice().sort((a, b) => num(b[3]) - num(a[3]))[0];
    return R(`${cad.length} ${cad.length === 1 ? 'cliente sumiu' : 'clientes sumiram'}: ` + cad.map((c) => `${c[0]} (última compra ${c[1]})`).join('. ') + `. O maior valor é ${top[0]}, com ${top[3]} no ano.`, 'clientes');
  }
  if (/comprou mais|melhores clientes|top|ranking/i.test(t)) {
    const rk = clientes().slice().sort((a, b) => num(b[3]) - num(a[3])).slice(0, 3);
    return R('Quem mais comprou no ano: ' + rk.map((c, i) => `${i + 1}º ${c[0]} (${c[3]})`).join('. ') + '.', 'clientes');
  }
  if (/loja|estoque|peça|peca|produto/i.test(t)) {
    const inc = lojaIncompleta();
    return R(`${loja().length} peças na loja.` + (inc.length ? ` Ficha incompleta: ${inc.map((p) => `${p[0]} (${p[2]})`).join('. ')}.` : ' Todas com ficha completa.'), 'loja');
  }
  if (/equipe|quem vê|quem ve|cargo|time/i.test(t)) {
    return R('Equipe: ' + equipe().map((x) => `${x[1]} (${x[2]})`).join('. ') + '.', 'equipe');
  }
  if (/não soube|nao soube|qualidade|atendeu|avalia/i.test(t)) {
    return R('O que ela não soube: ' + duvidas().map((x) => `${x[1]} (${x[0]})`).join('. ') + '.', 'qualidade');
  }
  if (/contrato/i.test(t)) {
    return R('Contratos: ' + contratos().map((k) => `${k.who}: ${k.st} (${brl(k.val)})`).join('. ') + '.', 'contratos');
  }
  if (/regra|política|politica|desconto|pode|permitido/i.test(t)) {
    return R('Regras da casa: ' + regras().slice(0, 3).map((r) => r[0]).join('. ') + '.', undefined);
  }
  // nome de cliente ou conversa?
  const nome = [...conversas().map((c) => c.ficha && c.ficha.nome).filter(Boolean), ...clientes().map((c) => c[0].split(' · ')[0])].find((n) => n && t.includes(n.split(' ')[0].toLowerCase()) && n.split(' ')[0].length > 2);
  if (nome) {
    const conv = conversas().find((c) => c.ficha && c.ficha.nome === nome);
    const cli = clientes().find((c) => c[0].startsWith(nome));
    const partes = [];
    if (cli) partes.push(`${cli[0]}: ${cli[3]} no ano, última compra ${cli[1]}, ${cli[2]}`);
    if (conv) partes.push(`na conversa: ${conv.sub}`);
    if (partes.length) return R(partes.join('. ') + '.', 'conversas');
  }
  if (/conversa|mensagem|whatsapp|atendimento/i.test(t)) {
    return R('Conversas: ' + conversas().slice(0, 4).map((c) => `${c.who}: ${c.sub}`).join('. ') + '.', 'conversas');
  }
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|e ai|e aí)\b/i.test(t)) {
    return R(pede.length ? `Oi! ${pede.length} ${pede.length === 1 ? 'luz pede' : 'luzes pedem'} você; o resto eu resolvo. Posso contar o caixa, ler a agenda ou falar de um cliente.` : 'Oi! Nada pede você. Posso contar o caixa, ler a agenda ou falar de um cliente.');
  }
  const tela = acharTela(q);
  if (tela) { const nv = D.NAV.find((n) => n[0] === tela); return R(`Abrindo ${nv[1]}.`, tela); }
  return R(`Posso contar o caixa, ler as luzes, falar de um cliente, ver a agenda ou abrir uma tela. Tente: "${D.HINTS[Math.floor(Math.random() * D.HINTS.length)]}".`);
}

// ---------- voz (via servidor Edge) ----------
const vozCache = new Map();
async function voz(texto, alt) {
  texto = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!texto) throw new HttpError(400, 'texto vazio');
  const v = (alt && alt.voice) || JARVIS.voice;
  const rate = (alt && alt.rate) || JARVIS.rate;
  const pitch = (alt && alt.pitch) || JARVIS.pitch;
  if (!VOZES_OK.has(v)) throw new HttpError(400, 'voz desconhecida');
  const chave = `${v}\n${rate}\n${pitch}\n${texto}`;
  if (vozCache.has(chave)) return vozCache.get(chave);
  const p = (async () => {
    let r;
    try {
      r = await fetch(`${EDGE_URL}/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texto, voice: v, rate, pitch }), signal: AbortSignal.timeout(30000) });
    } catch (e) { throw new HttpError(503, `servidor Edge fora do ar (${EDGE_URL}): ${e.message}`); }
    if (!r.ok) throw new HttpError(502, `Edge respondeu ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) throw new HttpError(502, 'Edge devolveu áudio vazio');
    return buf;
  })();
  vozCache.set(chave, p);
  p.catch(() => vozCache.delete(chave));
  if (vozCache.size > 200) vozCache.delete(vozCache.keys().next().value);
  return p;
}

// estado completo: IA, ouvido e, com login, quantos registros reais o Mentor enxerga
async function infoCompleta(auth) {
  const k = !!openrouterKey();
  const base = { ok: true, fonte: 'banco', modelo: MODELO, ia: k ? 'openrouter' : 'local', openrouter: k, stt: k ? 'openrouter' : ((await sttLocalOk()) ? 'local' : 'desligado'), edge: EDGE_URL, dados: {} };
  if (auth && auth.token) {
    try {
      const sb = require('./supa').cliente(auth.token, auth.apikey), eu = sb && await sb.eu();
      if (eu) {
        const r = await require('./retrato').retrato(sb, eu, auth.token);
        base.usuario = eu.email;
        base.dados = { conversas: r.conversas.length, leads: r.leads.total, clientes: r.clientes.total, agenda: r.agenda.length, cobrancas: r.fin.vencidas.length + r.fin.hoje.length + r.fin.proximas.length, produtos: r.produtos.length, contratos: r.contratos.length };
      }
    } catch (e) { base.erro = String(e.message || e).slice(0, 120); }
  }
  return base;
}

function info() {
  return {
    ok: true, fonte: 'banco', modelo: MODELO, whisper: WHISPER, openrouter: !!openrouterKey(), edge: EDGE_URL,
    dados: { luzes: D.LIGHTS.length, conversas: D.CONVS.length, clientes: D.CLIENTES.length, eventos: D.EVENTS.length, pecas: D.PRODS.length, equipe: D.TEAM.length, cobrancas: D.COBR.length, contratos: D.CONTRACTS.length },
  };
}

module.exports = { HttpError, ouvir, perguntar, voz, info, infoCompleta, listaDados, retrato, temGroq: () => !!openrouterKey() };
